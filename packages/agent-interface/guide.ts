// The short guide the agent sees in its first message. Pure; no just-bash import.

import type { Product } from "../../apps/storefront/lib/catalog.ts";

export function buildGuide(catalog: readonly Product[]): string {
  return `Trailhead Shoes: agent interface. This store sells ${catalog.length} products.\n`;
}
