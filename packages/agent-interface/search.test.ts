// Contract tests: Perry's "interface gates". Every answer is checked against
// one computed independently from the catalog.

import assert from "node:assert/strict";
import { test } from "node:test";

import { catalog, findVariant } from "../../apps/storefront/lib/catalog.ts";
import { DEFAULT_LIMIT, searchCatalog, type SearchFilters, type VariantRow } from "./search.ts";

const lower = (s: string) => s.toLowerCase();

/** Which filters a variant fails, computed without search.ts. */
function failedFilters(sku: string, f: SearchFilters): string[] {
  const { product: p, variant: v } = findVariant(sku)!;
  const out: string[] = [];
  if (f.color !== undefined && lower(p.color) !== lower(f.color)) out.push("color");
  if (f.category !== undefined && lower(p.category) !== lower(f.category)) out.push("category");
  if (f.maxPrice !== undefined && p.priceUsd > f.maxPrice) out.push("maxPrice");
  if (f.minPrice !== undefined && p.priceUsd < f.minPrice) out.push("minPrice");
  const text = lower(`${p.name} ${p.description}`);
  for (const w of f.words ?? []) if (!text.includes(lower(w))) out.push(`word:${w}`);
  if (f.size !== undefined && v.size !== f.size) out.push("size");
  if (f.inStock && v.stock <= 0) out.push("inStock");
  return out;
}

const allSkus = catalog.flatMap((p) => p.variants.map((v) => v.sku));
const expected = (f: SearchFilters) => allSkus.filter((sku) => failedFilters(sku, f).length === 0);

function rowIsTrue(r: VariantRow): boolean {
  const match = findVariant(r.sku);
  if (!match) return false;
  const { product: p, variant: v } = match;
  return (
    r.slug === p.slug &&
    r.name === p.name &&
    r.color === p.color &&
    r.category === p.category &&
    r.priceUsd === p.priceUsd &&
    r.size === v.size &&
    r.stock === v.stock &&
    r.inStock === v.stock > 0
  );
}

function combinations(): SearchFilters[] {
  const colors = [undefined, ...new Set(catalog.map((p) => p.color)), "BLACK", "red"];
  const categories = [undefined, ...new Set(catalog.map((p) => p.category))];
  const sizes = [undefined, ...new Set(catalog.flatMap((p) => p.variants.map((v) => v.size))), 11];
  const prices: Pick<SearchFilters, "minPrice" | "maxPrice">[] = [{}, { maxPrice: 79 }, { maxPrice: 90 }, { maxPrice: 120 }, { minPrice: 80, maxPrice: 110 }, { minPrice: 200 }];
  const words: (string[] | undefined)[] = [undefined, ["racer"], ["Running", "shoe"], ["boot"]];
  const out: SearchFilters[] = [];
  for (const color of colors)
    for (const category of categories)
      for (const size of sizes)
        for (const inStock of [false, true])
          for (const price of prices)
            for (const w of words) out.push({ color, category, size, inStock, ...price, ...(w ? { words: w } : {}) });
  return out;
}

const all = combinations();

test("soundness: every returned row satisfies every filter and matches the catalog", () => {
  assert.ok(all.length > 5000, `${all.length} combinations`);
  for (const f of all)
    for (const r of searchCatalog(catalog, f).rows) {
      assert.ok(rowIsTrue(r), `${r.sku} disagrees with the catalog`);
      assert.deepEqual(failedFilters(r.sku, f), [], `${r.sku} for ${JSON.stringify(f)}`);
    }
});

test("completeness: every matching variant is returned, in catalog order, with the right total", () => {
  for (const f of all) {
    const want = expected(f);
    const { total, rows } = searchCatalog(catalog, f);
    assert.equal(total, want.length, JSON.stringify(f));
    assert.deepEqual(rows.map((r) => r.sku), want.slice(0, DEFAULT_LIMIT), JSON.stringify(f));
  }
});

test("near misses never match and each fails exactly one filter", () => {
  for (const f of all) {
    const { rows, nearMisses } = searchCatalog(catalog, f);
    assert.ok(nearMisses.length <= 3);
    if (rows.length >= 3) assert.equal(nearMisses.length, 0);
    const matched = new Set(rows.map((r) => r.slug));
    for (const m of nearMisses) {
      assert.ok(!matched.has(m.slug), `${m.name} is both a match and a near miss for ${JSON.stringify(f)}`);
      const p = catalog.find((x) => x.slug === m.slug)!;
      const best = Math.min(...p.variants.map((v) => failedFilters(v.sku, f).length));
      assert.equal(best, 1, `${m.name} (${m.reason}) for ${JSON.stringify(f)}`);
    }
  }
});

test("limit caps rows, not the total", () => {
  const { total, rows } = searchCatalog(catalog, { limit: 5 });
  assert.equal(total, allSkus.length);
  assert.deepEqual(rows.map((r) => r.sku), allSkus.slice(0, 5));
});

test("the demo query returns exactly VEL-BLK-08, with honest near misses", () => {
  const r = searchCatalog(catalog, { color: "black", category: "running", maxPrice: 120, size: 8, inStock: true });
  assert.deepEqual(r.rows.map((x) => x.sku), ["VEL-BLK-08"]);
  assert.equal(r.total, 1);
  assert.ok(r.nearMisses.some((m) => m.name === "Tempo Lite" && m.reason === "size 8 is sold out"));
});

test("the query with no valid answer returns 0 matches", () => {
  const r = searchCatalog(catalog, { color: "black", category: "running", maxPrice: 90, size: 8, inStock: true });
  assert.equal(r.total, 0);
  assert.deepEqual(r.rows, []);
});
