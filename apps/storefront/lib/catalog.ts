// Product truth: prices, colors, categories and per-size inventory.
//
// PROTECTED (DROID_PROTECTED_PATHS). Factory Droid never edits this file, and
// the baseline and patched storefronts share it unchanged, so both versions
// sell exactly the same products at the same prices with the same stock.
//
// Exactly one variant satisfies the demo task (black running shoe, under
// $120, size 8, in stock): VEL-BLK-08. Every other product is a near-miss
// that the baseline search results do not reveal:
//   Tempo Lite      black running, $109, size 8 sold out
//   Cloud Glide     navy running,  $95
//   Aero Pace       white running, $79
//   Summit Hiker    black hiking boot, $89
//   Stride Pro      black running, $125 (over budget)

export type Category = "running" | "hiking";

export interface Variant {
  size: number;
  sku: string;
  stock: number;
}

export interface Product {
  slug: string;
  name: string;
  category: Category;
  color: string;
  priceUsd: number;
  description: string;
  variants: Variant[];
}

const variants = (prefix: string, stock: Record<number, number>): Variant[] =>
  Object.entries(stock).map(([size, count]) => ({
    size: Number(size),
    sku: `${prefix}-${size.padStart(2, "0")}`,
    stock: count,
  }));

const products: Product[] = [
  {
    slug: "tempo-lite",
    name: "Tempo Lite",
    category: "running",
    color: "black",
    priceUsd: 109,
    description: "A lightweight daily trainer with a responsive foam midsole.",
    variants: variants("TMP-BLK", { 7: 4, 8: 0, 9: 3, 10: 2 }),
  },
  {
    slug: "cloud-glide",
    name: "Cloud Glide",
    category: "running",
    color: "navy",
    priceUsd: 95,
    description: "Soft cushioning for easy miles and recovery runs.",
    variants: variants("CLG-NVY", { 7: 2, 8: 5, 9: 4, 10: 1 }),
  },
  {
    slug: "aero-pace",
    name: "Aero Pace",
    category: "running",
    color: "white",
    priceUsd: 79,
    description: "A breathable, minimal shoe for tempo days.",
    variants: variants("AER-WHT", { 7: 3, 8: 6, 9: 2, 10: 2 }),
  },
  {
    slug: "summit-hiker",
    name: "Summit Hiker",
    category: "hiking",
    color: "black",
    priceUsd: 89,
    description: "A waterproof hiking boot with a lugged outsole for rough trails.",
    variants: variants("SUM-BLK", { 7: 1, 8: 4, 9: 3, 10: 2 }),
  },
  {
    slug: "stride-pro",
    name: "Stride Pro",
    category: "running",
    color: "black",
    priceUsd: 125,
    description: "A carbon-plated racer built for race day.",
    variants: variants("STR-BLK", { 7: 2, 8: 3, 9: 3, 10: 1 }),
  },
  {
    slug: "velocity-runner",
    name: "Velocity Runner",
    category: "running",
    color: "black",
    priceUsd: 98,
    description: "A versatile neutral running shoe for everyday training.",
    variants: variants("VEL-BLK", { 7: 2, 8: 3, 9: 0, 10: 4 }),
  },
];

for (const p of products) {
  Object.freeze(p.variants.map(Object.freeze));
  Object.freeze(p);
}

export const catalog: readonly Product[] = Object.freeze(products);

export function getProduct(slug: string): Product | undefined {
  return catalog.find((p) => p.slug === slug);
}

export function findVariant(sku: string): { product: Product; variant: Variant } | undefined {
  for (const product of catalog) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) return { product, variant };
  }
  return undefined;
}
