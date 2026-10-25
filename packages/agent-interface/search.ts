// Catalog search for `shop search`: filters run in code, so the agent doesn't
// filter in its head. Pure (no just-bash import).

import type { Product, Variant } from "../../apps/storefront/lib/catalog.ts";

export interface SearchFilters {
  color?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: number;
  inStock?: boolean;
  /** Words matched case-insensitively against name or description; all must match. */
  words?: string[];
  /** Maximum rows returned (default 20); `total` still counts every match. */
  limit?: number;
}

export interface VariantRow {
  sku: string;
  slug: string;
  name: string;
  color: string;
  category: string;
  priceUsd: number;
  size: number;
  stock: number;
  inStock: boolean;
}

/** A product that fails exactly one filter. Never a match. */
export interface NearMiss {
  name: string;
  slug: string;
  reason: string;
}

export const DEFAULT_LIMIT = 20;
/** Below this many matches, the result also lists near misses. */
const FEW = 3;
const MAX_NEAR_MISSES = 3;

export const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function variantRow(product: Product, variant: Variant): VariantRow {
  return {
    sku: variant.sku,
    slug: product.slug,
    name: product.name,
    color: product.color,
    category: product.category,
    priceUsd: product.priceUsd,
    size: variant.size,
    stock: variant.stock,
    inStock: variant.stock > 0,
  };
}

/** One tab-separated line per variant. */
export function formatRow(r: VariantRow): string {
  return [r.sku, r.name, r.color, r.category, usd(r.priceUsd), `size ${r.size}`, r.inStock ? `stock ${r.stock}` : "sold out"].join(
    "\t",
  );
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function searchCatalog(
  catalog: readonly Product[],
  f: SearchFilters,
): { total: number; rows: VariantRow[]; nearMisses: NearMiss[] } {
  const matches: VariantRow[] = [];
  const nearMisses: NearMiss[] = [];
  for (const p of catalog) {
    // One reason per failed filter.
    const fails: string[] = [];
    if (f.color !== undefined && !same(p.color, f.color)) fails.push(`color is ${p.color}, not ${f.color}`);
    if (f.category !== undefined && !same(p.category, f.category)) fails.push(`category is ${p.category}, not ${f.category}`);
    if (f.maxPrice !== undefined && p.priceUsd > f.maxPrice) fails.push(`${usd(p.priceUsd)} is over --max-price ${f.maxPrice}`);
    if (f.minPrice !== undefined && p.priceUsd < f.minPrice) fails.push(`${usd(p.priceUsd)} is under --min-price ${f.minPrice}`);
    const text = `${p.name} ${p.description}`.toLowerCase();
    for (const w of f.words ?? []) if (!text.includes(w.toLowerCase())) fails.push(`doesn't mention "${w}"`);

    // With --size, only that size's variant counts; a missing size is one failure.
    const candidates = f.size === undefined ? p.variants : p.variants.filter((v) => v.size === f.size);
    if (candidates.length === 0) fails.push(`no size ${f.size}`);
    const hits = candidates.filter((v) => !f.inStock || v.stock > 0);
    if (f.inStock && candidates.length > 0 && hits.length === 0)
      fails.push(f.size === undefined ? "sold out in every size" : `size ${f.size} is sold out`);

    if (fails.length === 0) for (const v of hits) matches.push(variantRow(p, v));
    else if (fails.length === 1) nearMisses.push({ name: p.name, slug: p.slug, reason: fails[0]! });
  }
  return {
    total: matches.length,
    rows: matches.slice(0, f.limit ?? DEFAULT_LIMIT),
    nearMisses: matches.length < FEW ? nearMisses.slice(0, MAX_NEAR_MISSES) : [],
  };
}

/** The command's text output: a count line, the rows, then any near misses. */
export function formatSearch({ total, rows, nearMisses }: ReturnType<typeof searchCatalog>): string {
  const lines = [
    total === 0
      ? "0 matches"
      : `${total} match${total === 1 ? "" : "es"} (showing ${rows.length})${total > rows.length ? "; narrow with --max-price or --size" : ""}`,
    ...rows.map(formatRow),
  ];
  if (nearMisses.length > 0) lines.push("Near misses:", ...nearMisses.map((m) => `  ${m.name}: ${m.reason}`));
  return `${lines.join("\n")}\n`;
}
