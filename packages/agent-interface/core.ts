// All `shop` behavior, shared by the sandbox command, the tests and the MCP
// server, so every way in is covered by the same contract tests.
//
// Facts come from the catalog at call time; the cart is the store's real cart.
// Exit codes: 0 success, 1 the agent's mistake (the message says what to do
// next), 2 a system problem (store unreachable, timeout). Only ever contacts
// storeUrl; refusals never change the cart; checkout never places an order.

import { catalog, findVariant, getProduct, type Product } from "../../apps/storefront/lib/catalog.ts";
import { formatRow, formatSearch, searchCatalog, usd, variantRow, type SearchFilters } from "./search.ts";

export interface ShopContext {
  storeUrl: string;
  cartId: string;
}

export interface ShopResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const TIMEOUT_MS = 5000;

export const USAGE = `Usage:
  shop search [--color C] [--category C] [--min-price N] [--max-price N] [--size N] [--in-stock] [words...] [--json] [--limit N]
  shop product <slug-or-SKU> [--json]
  shop cart add <SKU>
  shop cart show [--json]
  shop checkout --dry-run
  shop help
`;

const ok = (stdout: string): ShopResult => ({ stdout, stderr: "", exitCode: 0 });
const fail = (stderr: string, exitCode = 1): ShopResult => ({ stdout: "", stderr: `${stderr}\n`, exitCode });

// ---------------------------------------------------------------------------
// search / product
// ---------------------------------------------------------------------------

const NUMBER_FLAGS = { "--min-price": "minPrice", "--max-price": "maxPrice", "--size": "size", "--limit": "limit" } as const;
const TEXT_FLAGS = { "--color": "color", "--category": "category" } as const;

function searchCommand(args: string[]): ShopResult {
  const filters: SearchFilters = {};
  const words: string[] = [];
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = (args[i] ?? "").split(/=(.*)/s, 2) as [string, string | undefined];
    if (flag === "--json") json = true;
    else if (flag === "--in-stock") filters.inStock = true;
    else if (flag in TEXT_FLAGS || flag in NUMBER_FLAGS) {
      const value = inline ?? args[++i];
      if (value === undefined || value === "") return fail(`shop: ${flag} needs a value\n${USAGE}`);
      if (flag in TEXT_FLAGS) {
        filters[TEXT_FLAGS[flag as keyof typeof TEXT_FLAGS]] = value;
        continue;
      }
      const n = Number(value);
      const key = NUMBER_FLAGS[flag as keyof typeof NUMBER_FLAGS];
      if (!Number.isFinite(n) || n < 0 || (key === "limit" && (!Number.isInteger(n) || n < 1)))
        return fail(`shop: ${flag} must be a ${key === "limit" ? "whole number of at least 1" : "number"}, got "${value}"\n${USAGE}`);
      filters[key] = n;
    } else if (flag.startsWith("-")) return fail(`shop: unknown option "${flag}" for search\n${USAGE}`);
    else words.push(flag);
  }
  if (words.length) filters.words = words;

  const result = searchCatalog(catalog, filters);
  return ok(json ? `${JSON.stringify(result.rows)}\n` : formatSearch(result));
}

function productCommand(args: string[]): ShopResult {
  const json = args.includes("--json");
  const keys = args.filter((a) => a !== "--json");
  const key = keys[0];
  if (!key || keys.length > 1) return fail("shop: usage: shop product <slug-or-SKU> [--json]");
  const product: Product | undefined = getProduct(key) ?? findVariant(key)?.product;
  if (!product) return fail(`shop: no product "${key}". Try shop search.`);
  if (json) {
    const { variants, ...fields } = product;
    return ok(`${JSON.stringify({ ...fields, variants: variants.map((v) => ({ ...v, inStock: v.stock > 0 })) })}\n`);
  }
  return ok(
    [
      [product.name, product.color, product.category, usd(product.priceUsd)].join("\t"),
      product.description,
      "size\tSKU\tstock",
      ...product.variants.map((v) => `${v.size}\t${v.sku}\t${v.stock > 0 ? v.stock : "sold out"}`),
    ].join("\n") + "\n",
  );
}

// ---------------------------------------------------------------------------
// cart / checkout
// ---------------------------------------------------------------------------

interface CartLine {
  sku: string;
  name: string | null;
  size: number | null;
  priceUsd: number | null;
  quantity: number;
}
interface Cart {
  items: CartLine[];
  totalUsd: number;
}

/** A store problem; reported with exit 2. */
class StoreError extends Error {}

const reason = (e: unknown) =>
  e instanceof Error ? (e.name === "TimeoutError" ? "timed out" : e.message.split("\n")[0]) : String(e);

/** The real cart, read from the store backend. Names, sizes and prices come from the catalog. */
async function readCart({ storeUrl, cartId }: ShopContext): Promise<Cart> {
  const url = new URL("/api/cart", storeUrl);
  url.searchParams.set("cartId", cartId);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new StoreError(reason(e));
  }
  if (!response.ok) throw new StoreError(`HTTP ${response.status}`);
  const body = (await response.json().catch(() => {
    throw new StoreError("the cart response wasn't JSON");
  })) as { items?: { sku: string; quantity: number }[] };
  const items = (body.items ?? []).map((i): CartLine => {
    const match = findVariant(i.sku);
    return {
      sku: i.sku,
      name: match?.product.name ?? null,
      size: match?.variant.size ?? null,
      priceUsd: match?.product.priceUsd ?? null,
      quantity: i.quantity,
    };
  });
  return { items, totalUsd: items.reduce((sum, i) => sum + (i.priceUsd ?? 0) * i.quantity, 0) };
}

/** POSTs the product page's add-to-cart form and reads where the store redirected. */
async function postAdd({ storeUrl, cartId }: ShopContext, sku: string, slug: string): Promise<"added" | "sold-out"> {
  let response: Response;
  try {
    response = await fetch(new URL("/api/cart", storeUrl), {
      method: "POST",
      body: new URLSearchParams({ sku, slug }),
      headers: { Cookie: `cart_id=${cartId}` },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new StoreError(reason(e));
  }
  const location = response.headers.get("location");
  if (response.status === 303 && location) {
    const target = new URL(location, storeUrl);
    if (target.pathname === "/cart") return "added";
    if (target.searchParams.get("error") === "sold-out" || target.pathname === "/search") return "sold-out";
  }
  throw new StoreError(`unexpected response HTTP ${response.status}`);
}

/** In-stock alternatives for a sold-out variant: same color and size first, then other sizes of the same product. */
function alternatives(product: Product, size: number): string[] {
  const sameColorSize = catalog
    .filter((p) => p.slug !== product.slug && p.color === product.color)
    .flatMap((p) => p.variants.filter((v) => v.size === size && v.stock > 0).map((v) => variantRow(p, v)));
  const otherSizes = product.variants.filter((v) => v.size !== size && v.stock > 0).map((v) => variantRow(product, v));
  return [...sameColorSize, ...otherSizes].slice(0, 3).map(formatRow);
}

const cartLine = (cart: Cart) => `${JSON.stringify(cart)}\n`;

async function cartAdd(args: string[], ctx: ShopContext): Promise<ShopResult> {
  const sku = args[0];
  if (!sku) return fail("shop: missing SKU. Usage: shop cart add <SKU>");
  if (args.length > 1) return fail("shop: add one SKU at a time. Usage: shop cart add <SKU>");

  const match = findVariant(sku);
  if (!match) return fail(`shop: unknown SKU "${sku}". Find SKUs with shop search or shop product <slug>.`);
  const { product, variant } = match;
  const label = `${sku} (${product.name}, size ${variant.size})`;
  if (variant.stock === 0) {
    const alts = alternatives(product, variant.size);
    return fail(`shop: ${label} is sold out.${alts.length ? `\nIn stock instead:\n${alts.join("\n")}` : ""}`);
  }

  const existing = (await readCart(ctx)).items.find((i) => i.sku === sku);
  if (existing) return fail(`shop: ${sku} is already in the cart (quantity ${existing.quantity}). Not adding it again.`);

  if ((await postAdd(ctx, sku, product.slug)) === "sold-out") return fail(`shop: ${sku} is sold out or unavailable.`);
  return ok(`Added ${label}.\n${cartLine(await readCart(ctx))}`);
}

async function checkoutDryRun(ctx: ShopContext): Promise<ShopResult> {
  const cart = await readCart(ctx);
  if (cart.items.length === 0) return ok("Cart is empty; nothing would be ordered.\nDry run: no order was placed.\n");
  const lines = cart.items.map((i) =>
    [
      i.sku,
      i.name ?? "unknown product",
      `size ${i.size ?? "?"}`,
      `qty ${i.quantity}`,
      i.priceUsd === null ? "price unknown" : `${usd(i.priceUsd)} each`,
      i.priceUsd === null ? "" : usd(i.priceUsd * i.quantity),
    ].join("\t"),
  );
  return ok(`Would order:\n${lines.join("\n")}\nTotal: ${usd(cart.totalUsd)}\nDry run: no order was placed.\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runShop(args: string[], ctx: ShopContext): Promise<ShopResult> {
  // `--qty` greater than 1 anywhere is refused; `--qty 1` is the default.
  const qtyAt = args.findIndex((a) => a === "--qty" || a.startsWith("--qty="));
  if (qtyAt !== -1) {
    const flag = args[qtyAt]!;
    const value = flag.includes("=") ? flag.slice(flag.indexOf("=") + 1) : args[qtyAt + 1];
    if (value !== "1") return fail("shop: only quantity 1 per add is supported");
    args = [...args.slice(0, qtyAt), ...args.slice(qtyAt + (flag.includes("=") ? 1 : 2))];
  }

  const [command, sub, ...rest] = args;
  try {
    if (command === undefined || command === "help" || command === "--help") return ok(USAGE);
    if (command === "search") return searchCommand(args.slice(1));
    if (command === "product") return productCommand(args.slice(1));
    if (command === "cart" && sub === "add") return await cartAdd(rest, ctx);
    if (command === "cart" && sub === "show" && rest.every((a) => a === "--json")) return ok(cartLine(await readCart(ctx)));
    if (command === "checkout") {
      if (sub === "--dry-run" && rest.length === 0) return await checkoutDryRun(ctx);
      return fail("shop: checkout needs human approval and is not available to agents. Use --dry-run to preview.");
    }
    return fail(`shop: unknown command "${args.join(" ")}"\n${USAGE}`);
  } catch (e) {
    if (e instanceof StoreError) return fail(`shop: could not reach the store (${e.message})`, 2);
    throw e;
  }
}
