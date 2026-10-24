// Patch gates that don't need a running Droid: the changed-files allowlist and
// the search-card integrity check. Both are pure, so they are unit-tested.

import { parse, type DefaultTreeAdapterTypes as T } from "parse5";

export interface CheckResult {
  ok: boolean;
  problems: string[];
}

/** Every changed or new file must be allowlisted and outside the protected paths. */
export function checkChangedFiles(
  files: readonly string[],
  allowed: readonly string[],
  protectedPaths: readonly string[],
): CheckResult {
  const problems: string[] = [];
  if (files.length === 0) problems.push("Droid changed no files.");
  for (const f of files) {
    if (protectedPaths.some((p) => f === p || f.startsWith(p))) problems.push(`Protected path changed: ${f}`);
    else if (!allowed.includes(f)) problems.push(`File outside the allowlist changed: ${f}`);
  }
  return { ok: problems.length === 0, problems };
}

/** The catalog fields a search card may claim. Mirrors the storefront's Product. */
export interface CatalogProduct {
  slug: string;
  name: string;
  category: string;
  color: string;
  priceUsd: number;
  variants: readonly { size: number; stock: number }[];
}

const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "dd", "details", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li",
  "main", "nav", "ol", "p", "section", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);
const SKIP = new Set(["script", "style", "template", "noscript"]);
const PRODUCT_HREF = /^\/products\/([^/?#]+)/;

const isElement = (n: T.Node): n is T.Element => "tagName" in n;
const children = (n: T.Node): T.ChildNode[] => ("childNodes" in n ? n.childNodes : []);
const attr = (el: T.Element, name: string) => el.attrs.find((a) => a.name === name)?.value;

/**
 * Finds the search-result cards on a rendered page: for each product link,
 * the largest ancestor that links to that product only. Cards never extend
 * into the element holding the page's h1.
 */
export function findCards(html: string): { slug: string; card: T.Element }[] {
  const doc = parse(html);
  const slugsUnder = new Map<T.Node, Set<string>>();
  const hasH1 = new Set<T.Node>();
  const links: { slug: string; el: T.Element }[] = [];

  const walk = (node: T.Node): void => {
    const slugs = new Set<string>();
    let h1 = isElement(node) && node.tagName === "h1";
    if (isElement(node) && node.tagName === "a") {
      const slug = PRODUCT_HREF.exec(attr(node, "href") ?? "")?.[1];
      if (slug) {
        slugs.add(slug);
        links.push({ slug, el: node });
      }
    }
    for (const child of children(node)) {
      walk(child);
      for (const s of slugsUnder.get(child) ?? []) slugs.add(s);
      if (hasH1.has(child)) h1 = true;
    }
    slugsUnder.set(node, slugs);
    if (h1) hasH1.add(node);
  };
  walk(doc);

  const cards = new Map<T.Element, string>();
  for (const { slug, el } of links) {
    let card = el;
    for (;;) {
      const parent = card.parentNode;
      if (!parent || !isElement(parent) || hasH1.has(parent) || slugsUnder.get(parent)?.size !== 1) break;
      card = parent;
    }
    cards.set(card, slug);
  }
  return [...cards].map(([card, slug]) => ({ slug, card }));
}

/**
 * Visible text of a card, split into chunks: one per block element, holding
 * the text whose nearest block ancestor is that element. aria-labels count as text.
 */
export function cardChunks(card: T.Element): string[] {
  const chunks = new Map<T.Element, string[]>();
  const visit = (node: T.Node, block: T.Element): void => {
    if (isElement(node)) {
      if (SKIP.has(node.tagName) || attr(node, "hidden") !== undefined || attr(node, "aria-hidden") === "true") return;
      if (BLOCK.has(node.tagName)) block = node;
      const label = attr(node, "aria-label");
      if (label) push(block, label);
    } else if (node.nodeName === "#text") {
      push(block, (node as T.TextNode).value);
    }
    for (const child of children(node)) visit(child, block);
  };
  const push = (block: T.Element, text: string) => {
    const list = chunks.get(block) ?? [];
    list.push(text);
    chunks.set(block, list);
  };
  visit(card, card);
  return [...chunks.values()]
    .map((parts) => parts.join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const OUT_OF_STOCK = /sold out|out of stock|unavailable|not available|no stock/;
const IN_STOCK = /in stock|available|\bleft\b|remaining/;
const SIZE = /\bsize\s*:?\s*(\d+(?:\.5)?)\b/g;
const COUNT = /\b(\d+)\s*(?:left|remaining|in stock|available)\b/;
const PRICE = /\$\s*(\d+(?:\.\d+)?)/g;

/** Claims one card makes that contradict the catalog. */
export function checkCard(product: CatalogProduct, chunks: readonly string[], catalog: readonly CatalogProduct[]): string[] {
  const problems: string[] = [];
  const where = `${product.slug} card`;
  const text = chunks.join(" ").toLowerCase();

  const prices = [...text.matchAll(PRICE)].map((m) => Number(m[1]));
  if (prices.length === 0) problems.push(`${where}: price missing`);
  for (const p of prices) {
    if (p !== product.priceUsd) problems.push(`${where}: shows $${p}, catalog price is $${product.priceUsd}`);
  }

  for (const color of new Set(catalog.map((p) => p.color.toLowerCase()))) {
    if (color !== product.color.toLowerCase() && new RegExp(`\\b${color}\\b`).test(text)) {
      problems.push(`${where}: mentions color "${color}", catalog color is "${product.color}"`);
    }
  }
  for (const category of new Set(catalog.map((p) => p.category.toLowerCase()))) {
    if (category !== product.category.toLowerCase() && new RegExp(`\\b${category}\\b`).test(text)) {
      problems.push(`${where}: mentions category "${category}", catalog category is "${product.category}"`);
    }
  }

  for (const raw of chunks) {
    const chunk = raw.toLowerCase();
    const sizes = [...chunk.matchAll(SIZE)].map((m) => Number(m[1]));
    for (const s of sizes) {
      if (!product.variants.some((v) => v.size === s)) problems.push(`${where}: size ${s} does not exist ("${raw}")`);
    }
    const out = OUT_OF_STOCK.test(chunk);
    const inStock = !out && IN_STOCK.test(chunk);
    if (!out && !inStock) continue;

    if (sizes.length === 0) {
      // A product-level claim, e.g. "In stock".
      const anyStock = product.variants.some((v) => v.stock > 0);
      if (out === anyStock) problems.push(`${where}: says "${raw}" but ${anyStock ? "some sizes are in stock" : "every size is sold out"}`);
      continue;
    }
    if (sizes.length > 1) {
      problems.push(`${where}: one line makes a stock claim about several sizes, which can't be checked ("${raw}")`);
      continue;
    }
    const variant = product.variants.find((v) => v.size === sizes[0]);
    if (!variant) continue;
    if (out && variant.stock > 0) problems.push(`${where}: says size ${variant.size} is sold out, catalog stock is ${variant.stock}`);
    if (inStock && variant.stock === 0) problems.push(`${where}: says size ${variant.size} is in stock, catalog stock is 0`);
    const count = COUNT.exec(chunk.replace(SIZE, ""))?.[1];
    if (inStock && count !== undefined && Number(count) !== variant.stock) {
      problems.push(`${where}: says ${count} of size ${variant.size} left, catalog stock is ${variant.stock}`);
    }
  }
  return problems;
}

/**
 * Checks a rendered search page: it shows exactly the expected products, in
 * order, and no card contradicts the catalog on price, color, category or stock.
 */
export function checkSearchPage(
  html: string,
  expectedSlugs: readonly string[],
  catalog: readonly CatalogProduct[],
): CheckResult & { cards: number } {
  const cards = findCards(html);
  const problems: string[] = [];
  const shown = cards.map((c) => c.slug);
  if (shown.join(",") !== expectedSlugs.join(",")) {
    problems.push(`Results changed: expected [${expectedSlugs.join(", ")}], page shows [${shown.join(", ")}]`);
  }
  for (const { slug, card } of cards) {
    const product = catalog.find((p) => p.slug === slug);
    if (!product) problems.push(`Card links to unknown product ${slug}`);
    else problems.push(...checkCard(product, cardChunks(card), catalog));
  }
  return { ok: problems.length === 0, problems, cards: cards.length };
}
