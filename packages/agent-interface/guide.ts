// The short guide the agent sees in its first message, so it needn't spend a
// turn on `shop help`. Pure; no just-bash import. Every number comes from the
// catalog, and the worked example is real search output.

import type { Product } from "../../apps/storefront/lib/catalog.ts";
import { formatSearch, searchCatalog, type SearchFilters } from "./search.ts";

/**
 * The worked example. Deliberately not the demo task's query, so the guide
 * never hands the agent the answer.
 */
export const GUIDE_EXAMPLE: { command: string; filters: SearchFilters } = {
  command: "shop search --color white --size 9 --in-stock",
  filters: { color: "white", size: 9, inStock: true },
};

/** Lines that only make sense inside the bash sandbox (dropped for the MCP server). */
export const BASH_ONLY_LINES = ["Use the bash tool to run shop commands. Pipes and jq work."];

export function buildGuide(catalog: readonly Product[]): string {
  const byCategory = new Map<string, number>();
  for (const p of catalog) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
  const categories = [...byCategory].map(([c, n]) => `${n} ${c}`).join(", ");
  const sizes = catalog.flatMap((p) => p.variants.map((v) => v.size));

  return `Trailhead Shoes: agent interface
This store sells ${catalog.length} products (${categories}), in sizes ${Math.min(...sizes)}–${Math.max(...sizes)}.
${BASH_ONLY_LINES[0]}

Commands
  shop search [--color C] [--category C] [--min-price N] [--max-price N] [--size N] [--in-stock] [words...] [--json] [--limit N]
      find variants matching every filter; prints a count and near misses
  shop product <slug-or-SKU>    one product with every size, SKU and live stock
  shop cart add <SKU>           add one item; prints the full cart
  shop cart show                show the cart
  shop checkout --dry-run       preview an order (orders are never placed here)

Example
$ ${GUIDE_EXAMPLE.command}
${formatSearch(searchCatalog(catalog, GUIDE_EXAMPLE.filters))}`;
}
