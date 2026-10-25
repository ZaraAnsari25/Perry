// Contract tests: Perry's "interface gates" for `shop search` (CONTRACT.md).
// They go through runShop, so they check any implementation (SHOP_IMPL), and
// every answer is compared with one computed independently from the catalog.

import assert from "node:assert/strict";
import { test } from "node:test";

import { catalog, findVariant, type Product } from "../../apps/storefront/lib/catalog.ts";
import type { VariantRow } from "./search.ts";
import { runShop } from "./test-impl.ts";

interface Filters {
  color?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: number;
  inStock?: boolean;
  words?: string[];
}

const ctx = { storeUrl: "http://store.test", cartId: "contract" };
const lower = (s: string) => s.toLowerCase();

function args(f: Filters, extra: string[] = []): string[] {
  const a = ["search"];
  if (f.color !== undefined) a.push("--color", f.color);
  if (f.category !== undefined) a.push("--category", f.category);
  if (f.minPrice !== undefined) a.push("--min-price", String(f.minPrice));
  if (f.maxPrice !== undefined) a.push("--max-price", String(f.maxPrice));
  if (f.size !== undefined) a.push("--size", String(f.size));
  if (f.inStock) a.push("--in-stock");
  return [...a, ...(f.words ?? []), ...extra];
}

/** The filters a product fails, counted the way CONTRACT.md counts them. */
function productFailures(p: Product, f: Filters): number {
  let fails = 0;
  if (f.color !== undefined && lower(p.color) !== lower(f.color)) fails++;
  if (f.category !== undefined && lower(p.category) !== lower(f.category)) fails++;
  if (f.minPrice !== undefined && p.priceUsd < f.minPrice) fails++;
  if (f.maxPrice !== undefined && p.priceUsd > f.maxPrice) fails++;
  const text = lower(`${p.name} ${p.description}`);
  for (const w of f.words ?? []) if (!text.includes(lower(w))) fails++;
  const candidates = f.size === undefined ? p.variants : p.variants.filter((v) => v.size === f.size);
  if (candidates.length === 0) fails++;
  else if (f.inStock && candidates.every((v) => v.stock <= 0)) fails++;
  return fails;
}

/** Matching SKUs in catalog order, without using the implementation. */
function expected(f: Filters): string[] {
  return catalog.flatMap((p) =>
    productFailures(p, f) > 0
      ? []
      : p.variants.filter((v) => (f.size === undefined || v.size === f.size) && (!f.inStock || v.stock > 0)).map((v) => v.sku),
  );
}

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

function combinations(): Filters[] {
  const colors = [undefined, ...new Set(catalog.map((p) => p.color)), "BLACK", "red"];
  const categories = [undefined, ...new Set(catalog.map((p) => p.category))];
  const sizes = [undefined, ...new Set(catalog.flatMap((p) => p.variants.map((v) => v.size))), 11];
  const prices: Pick<Filters, "minPrice" | "maxPrice">[] = [
    {},
    { maxPrice: 79 },
    { maxPrice: 90 },
    { maxPrice: 120 },
    { minPrice: 80, maxPrice: 110 },
    { minPrice: 200 },
  ];
  const words: (string[] | undefined)[] = [undefined, ["racer"], ["Running", "shoe"], ["boot"]];
  const out: Filters[] = [];
  for (const color of colors)
    for (const category of categories)
      for (const size of sizes)
        for (const inStock of [false, true])
          for (const price of prices)
            for (const w of words) out.push({ color, category, size, inStock, ...price, ...(w ? { words: w } : {}) });
  return out;
}

const all = combinations();
const ALL = "1000";

test(`soundness and completeness over ${all.length} filter combinations (--json)`, async () => {
  assert.ok(all.length > 5000);
  for (const f of all) {
    const r = await runShop(args(f, ["--json", "--limit", ALL]), ctx);
    assert.equal(r.exitCode, 0, `${JSON.stringify(f)}: ${r.stderr}`);
    const rows = JSON.parse(r.stdout) as VariantRow[];
    for (const row of rows) assert.ok(rowIsTrue(row), `${row.sku} disagrees with the catalog`);
    assert.deepEqual(rows.map((x) => x.sku), expected(f), JSON.stringify(f));
  }
});

test("text output: the count line and rows agree with the catalog; near misses never match and fail exactly one filter", async () => {
  for (const f of all) {
    const want = expected(f);
    const r = await runShop(args(f), ctx);
    assert.equal(r.exitCode, 0, JSON.stringify(f));
    const lines = r.stdout.replace(/\n$/, "").split("\n");
    const shown = Math.min(want.length, 20);
    const count =
      want.length === 0
        ? "0 matches"
        : `${want.length} match${want.length === 1 ? "" : "es"} (showing ${shown})${want.length > shown ? "; narrow with --max-price or --size" : ""}`;
    assert.equal(lines[0], count, JSON.stringify(f));
    assert.deepEqual(lines.slice(1, 1 + shown).map((l) => l.split("\t")[0]), want.slice(0, shown), JSON.stringify(f));

    const rest = lines.slice(1 + shown);
    if (rest.length === 0) continue;
    assert.ok(want.length < 3, `near misses with ${want.length} matches: ${JSON.stringify(f)}`);
    assert.equal(rest[0], "Near misses:", JSON.stringify(f));
    const misses = rest.slice(1);
    assert.ok(misses.length >= 1 && misses.length <= 3, JSON.stringify(f));
    const matched = new Set(want.map((sku) => findVariant(sku)!.product.name));
    for (const line of misses) {
      const m = /^ {2}(.+?): (.+)$/.exec(line);
      assert.ok(m, `near-miss line format: ${JSON.stringify(line)}`);
      const product = catalog.find((p) => p.name === m[1]);
      assert.ok(product, `unknown product in ${line}`);
      assert.ok(!matched.has(product.name), `${product.name} is both a match and a near miss for ${JSON.stringify(f)}`);
      assert.equal(productFailures(product, f), 1, `${line} for ${JSON.stringify(f)}`);
    }
  }
});

test("rows are capped at --limit (default 20), not the total", async () => {
  const total = catalog.reduce((n, p) => n + p.variants.length, 0);
  const all = catalog.flatMap((p) => p.variants.map((v) => v.sku));
  const five = await runShop(["search", "--limit", "5", "--json"], ctx);
  assert.deepEqual((JSON.parse(five.stdout) as VariantRow[]).map((r) => r.sku), all.slice(0, 5));
  const text = await runShop(["search"], ctx);
  assert.match(text.stdout, new RegExp(`^${total} matches \\(showing ${Math.min(total, 20)}\\)`));
});

test("the demo query returns exactly VEL-BLK-08, with honest near misses", async () => {
  const r = await runShop(["search", "--color", "black", "--category", "running", "--max-price", "120", "--size", "8", "--in-stock"], ctx);
  const lines = r.stdout.trimEnd().split("\n");
  assert.equal(lines[0], "1 match (showing 1)");
  assert.equal(lines[1], "VEL-BLK-08\tVelocity Runner\tblack\trunning\t$98\tsize 8\tstock 3");
  assert.equal(lines[2], "Near misses:");
  assert.ok(lines.includes("  Tempo Lite: size 8 is sold out"));
});

test("the query with no valid answer returns 0 matches", async () => {
  const r = await runShop(["search", "--color", "black", "--category", "running", "--max-price", "90", "--size", "8", "--in-stock"], ctx);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /^0 matches\n/);
});

test("near-miss reasons use the contract's wording", async () => {
  const reasons = async (a: string[]) => (await runShop(["search", ...a], ctx)).stdout;
  assert.match(await reasons(["--color", "black", "--size", "8", "--in-stock", "--max-price", "120", "--category", "running"]), /\n {2}Tempo Lite: size 8 is sold out\n/);
  const priced = await reasons(["--color", "black", "--category", "running", "--min-price", "100", "--max-price", "120", "--size", "8", "--in-stock"]);
  assert.equal(priced, "0 matches\nNear misses:\n  Tempo Lite: size 8 is sold out\n  Stride Pro: $125 is over --max-price 120\n  Velocity Runner: $98 is under --min-price 100\n");
  assert.match(await reasons(["--color", "navy", "--max-price", "90"]), /^0 matches\nNear misses:\n {2}Cloud Glide: \$95 is over --max-price 90\n/);
  assert.match(await reasons(["--color", "white", "--min-price", "80"]), /\n {2}Aero Pace: \$79 is under --min-price 80\n/);
  assert.match(await reasons(["--category", "hiking", "--color", "navy"]), /\n {2}Summit Hiker: color is black, not navy\n/);
  assert.match(await reasons(["--color", "navy", "--category", "hiking"]), /\n {2}Cloud Glide: category is running, not hiking\n/);
  assert.match(await reasons(["--color", "white", "--size", "11"]), /\n {2}Aero Pace: no size 11\n/);
  assert.match(await reasons(["--color", "white", "boot"]), /\n {2}Aero Pace: doesn't mention "boot"\n/);
});
