// Search query module. Droid may edit this file (DROID_ALLOWED_FILES).
//
// Baseline behaviour: results carry only name and price, so a shopper has to
// open each product page to learn color, category and size availability.

import { catalog } from "./catalog";

export interface SearchResult {
  slug: string;
  name: string;
  priceUsd: number;
}

export function searchProducts(query: string): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog
    .filter((p) => {
      if (terms.length === 0) return true;
      const text = `${p.name} ${p.category} ${p.color} shoe shoes`.toLowerCase();
      return terms.some((t) => text.includes(t));
    })
    .map((p) => ({ slug: p.slug, name: p.name, priceUsd: p.priceUsd }));
}
