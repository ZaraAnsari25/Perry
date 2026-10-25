// Catalog search for `shop search`: filters run in code, so the agent doesn't
// filter in its head. Pure (no just-bash import).

import type { Product } from "../../apps/storefront/lib/catalog.ts";

export interface SearchFilters {
  color?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: number;
  inStock?: boolean;
  words?: string[];
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

export interface NearMiss {
  name: string;
  slug: string;
  reason: string;
}

export function searchCatalog(
  _catalog: readonly Product[],
  _f: SearchFilters,
): { total: number; rows: VariantRow[]; nearMisses: NearMiss[] } {
  return { total: 0, rows: [], nearMisses: [] };
}
