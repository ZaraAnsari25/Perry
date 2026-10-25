// Search query module. Droid may edit this file (DROID_ALLOWED_FILES).

import { catalog, type Category, type Variant } from "./catalog";

export interface SearchResult {
  slug: string;
  name: string;
  priceUsd: number;
  color: string;
  category: Category;
  variants: Variant[];
}

export function searchProducts(query: string): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog
    .filter((p) => {
      if (terms.length === 0) return true;
      const text = `${p.name} ${p.category} ${p.color} shoe shoes`.toLowerCase();
      return terms.some((t) => text.includes(t));
    })
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      priceUsd: p.priceUsd,
      color: p.color,
      category: p.category,
      variants: p.variants,
    }));
}
