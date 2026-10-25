import { catalog, findVariant, getProduct, type Product } from "../../../apps/storefront/lib/catalog.ts";

type ShopContext = { storeUrl: string; cartId: string };
type ShopResult = { stdout: string; stderr: string; exitCode: number };
type CatalogVariant = Product["variants"][number];
type SearchRow = {
  sku: string;
  slug: string;
  name: string;
  color: string;
  category: string;
  priceUsd: number;
  size: number;
  stock: number;
  inStock: boolean;
};
type SearchOptions = {
  color?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: number;
  inStock: boolean;
  limit: number;
  json: boolean;
  words: string[];
};
type CartEntry = {
  sku: string;
  name: string;
  size: number;
  priceUsd: number;
  quantity: number;
};
type CartSummary = { items: CartEntry[]; totalUsd: number };

const usage = [
  "shop search [--color c] [--category c] [--min-price n] [--max-price n] [--size n] [--in-stock] [words...] [--json] [--limit n]",
  "shop product <slug-or-SKU> [--json]",
  "shop cart add <SKU>",
  "shop cart show [--json]",
  "shop checkout --dry-run",
].join("\n") + "\n";

class InputError extends Error {}
class StoreError extends Error {}

function printed(lines: string[]): ShopResult {
  return { stdout: lines.length === 0 ? "" : `${lines.join("\n")}\n`, stderr: "", exitCode: 0 };
}

function refused(message: string, includeUsage = false): ShopResult {
  return {
    stdout: "",
    stderr: `shop: ${message}\n${includeUsage ? usage : ""}`,
    exitCode: 1,
  };
}

function unknownCommand(args: string[]): ShopResult {
  return refused(`unknown command "${args.join(" ")}"`, true);
}

function toSearchRow(product: Product, variant: CatalogVariant): SearchRow {
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

function formatSearchRow(row: SearchRow): string {
  return [
    row.sku,
    row.name,
    row.color,
    row.category,
    `$${row.priceUsd}`,
    `size ${row.size}`,
    row.stock > 0 ? `stock ${row.stock}` : "sold out",
  ].join("\t");
}

function searchOptions(args: string[]): SearchOptions {
  const options: SearchOptions = { inStock: false, limit: 20, json: false, words: [] };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (!argument.startsWith("-")) {
      options.words.push(argument);
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--in-stock") {
      options.inStock = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const flag = equals < 0 ? argument : argument.slice(0, equals);
    if (!["--color", "--category", "--min-price", "--max-price", "--size", "--limit"].includes(flag)) {
      throw new InputError(`unknown flag "${flag}". See shop search usage below.`);
    }
    const value = equals < 0 ? args[++index] : argument.slice(equals + 1);
    if (value === undefined || value.trim() === "" || value.startsWith("--")) {
      throw new InputError(`missing value for ${flag}. Supply a value.`);
    }
    if (flag === "--color" || flag === "--category") {
      if (value.startsWith("-")) throw new InputError(`missing value for ${flag}. Supply a value.`);
      if (flag === "--color") options.color = value;
      else options.category = value;
      continue;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new InputError(`${flag} needs a non-negative number.`);
    }
    if (flag === "--limit" && (!Number.isInteger(number) || number < 1)) {
      throw new InputError("--limit needs a whole number of at least 1.");
    }
    if (flag === "--min-price") options.minPrice = number;
    else if (flag === "--max-price") options.maxPrice = number;
    else if (flag === "--size") options.size = number;
    else options.limit = number;
  }
  return options;
}

function searchProducts(args: string[]): ShopResult {
  const options = searchOptions(args);
  const rows: SearchRow[] = [];
  const nearMisses: string[] = [];
  for (const product of catalog) {
    const failures: string[] = [];
    if (options.color !== undefined && options.color.toLowerCase() !== product.color.toLowerCase()) {
      failures.push(`color is ${product.color}, not ${options.color}`);
    }
    if (options.category !== undefined && options.category.toLowerCase() !== product.category.toLowerCase()) {
      failures.push(`category is ${product.category}, not ${options.category}`);
    }
    if (options.minPrice !== undefined && product.priceUsd < options.minPrice) {
      failures.push(`$${product.priceUsd} is under --min-price ${options.minPrice}`);
    }
    if (options.maxPrice !== undefined && product.priceUsd > options.maxPrice) {
      failures.push(`$${product.priceUsd} is over --max-price ${options.maxPrice}`);
    }
    for (const word of options.words) {
      const folded = word.toLowerCase();
      if (!product.name.toLowerCase().includes(folded) && !product.description.toLowerCase().includes(folded)) {
        failures.push(`doesn't mention "${word}"`);
      }
    }
    const sizedVariants = product.variants.filter(
      (variant) => options.size === undefined || variant.size === options.size,
    );
    const matchingVariants = sizedVariants.filter((variant) => !options.inStock || variant.stock > 0);
    if (options.size !== undefined && sizedVariants.length === 0) {
      failures.push(`no size ${options.size}`);
    } else if (options.inStock && matchingVariants.length === 0) {
      failures.push(
        options.size === undefined ? "sold out in every size" : `size ${options.size} is sold out`,
      );
    }
    if (failures.length === 0) {
      rows.push(...matchingVariants.map((variant) => toSearchRow(product, variant)));
    } else if (failures.length === 1 && nearMisses.length < 3) {
      nearMisses.push(`  ${product.name}: ${failures[0]!}`);
    }
  }
  const shown = rows.slice(0, options.limit);
  if (options.json) return printed([JSON.stringify(shown)]);
  let heading = rows.length === 0
    ? "0 matches"
    : `${rows.length} ${rows.length === 1 ? "match" : "matches"} (showing ${shown.length})`;
  if (rows.length > shown.length) heading += "; narrow with --max-price or --size";
  const lines = [heading, ...shown.map(formatSearchRow)];
  if (rows.length < 3 && nearMisses.length > 0) lines.push("Near misses:", ...nearMisses);
  return printed(lines);
}

function describeProduct(args: string[], originalArgs: string[]): ShopResult {
  const identifiers = args.filter((argument) => argument !== "--json");
  const identifier = identifiers[0];
  if (identifiers.length !== 1 || identifier === undefined || identifier.startsWith("-")) {
    return unknownCommand(originalArgs);
  }
  const product = getProduct(identifier) ?? findVariant(identifier)?.product;
  if (product === undefined) return refused(`no product "${identifier}". Try shop search.`);
  if (args.includes("--json")) {
    return printed([JSON.stringify({
      slug: product.slug,
      name: product.name,
      category: product.category,
      color: product.color,
      priceUsd: product.priceUsd,
      description: product.description,
      variants: product.variants.map(({ size, sku, stock }) => ({ size, sku, stock, inStock: stock > 0 })),
    })]);
  }
  return printed([
    [product.name, product.color, product.category, `$${product.priceUsd}`].join("\t"),
    product.description,
    "size\tSKU\tstock",
    ...product.variants.map(
      ({ size, sku, stock }) => [size, sku, stock > 0 ? stock : "sold out"].join("\t"),
    ),
  ]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failureReason(error: unknown, otherwise: string): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "request timed out";
  }
  return otherwise;
}

async function storeRequest(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(5000) });
  } catch (error: unknown) {
    throw new StoreError(failureReason(error, "network error"));
  }
}

async function loadCart(ctx: ShopContext): Promise<CartSummary> {
  const endpoint = new URL("/api/cart", ctx.storeUrl);
  endpoint.searchParams.set("cartId", ctx.cartId);
  const response = await storeRequest(endpoint, { method: "GET" });
  if (!response.ok) throw new StoreError(`cart read returned HTTP ${response.status}`);
  let data: unknown;
  try {
    data = await response.json();
  } catch (error: unknown) {
    throw new StoreError(failureReason(error, "invalid cart JSON"));
  }
  if (!isObject(data) || !Array.isArray(data.items)) throw new StoreError("invalid cart response");
  const cart: CartSummary = { items: [], totalUsd: 0 };
  for (const item of data.items) {
    if (!isObject(item) || typeof item.sku !== "string" || typeof item.quantity !== "number" ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new StoreError("invalid cart item");
    }
    const found = findVariant(item.sku);
    if (found === undefined) throw new StoreError("unknown SKU in cart");
    cart.items.push({
      sku: item.sku,
      name: found.product.name,
      size: found.variant.size,
      priceUsd: found.product.priceUsd,
      quantity: item.quantity,
    });
    cart.totalUsd += found.product.priceUsd * item.quantity;
  }
  return cart;
}

function stockAlternatives(product: Product, variant: CatalogVariant): SearchRow[] {
  const alternatives: SearchRow[] = [];
  for (const candidate of catalog) {
    if (candidate.slug === product.slug || candidate.color.toLowerCase() !== product.color.toLowerCase()) {
      continue;
    }
    for (const candidateVariant of candidate.variants) {
      if (candidateVariant.size === variant.size && candidateVariant.stock > 0) {
        alternatives.push(toSearchRow(candidate, candidateVariant));
      }
    }
  }
  for (const candidateVariant of product.variants) {
    if (candidateVariant.size !== variant.size && candidateVariant.stock > 0) {
      alternatives.push(toSearchRow(product, candidateVariant));
    }
  }
  return alternatives.slice(0, 3);
}

async function addSku(args: string[], ctx: ShopContext): Promise<ShopResult> {
  if (args.length === 0) return refused("missing SKU. Usage: shop cart add <SKU>");
  if (args.length > 1) return refused("add one SKU at a time. Usage: shop cart add <SKU>");
  const sku = args[0]!;
  const found = findVariant(sku);
  if (found === undefined) {
    return refused(`unknown SKU "${sku}". Find SKUs with shop search or shop product <slug>.`);
  }
  const { product, variant } = found;
  if (variant.stock === 0) {
    const result = refused(`${sku} (${product.name}, size ${variant.size}) is sold out.`);
    const alternatives = stockAlternatives(product, variant);
    if (alternatives.length > 0) {
      result.stderr += `In stock instead:\n${alternatives.map(formatSearchRow).join("\n")}\n`;
    }
    return result;
  }
  const cartBefore = await loadCart(ctx);
  const existing = cartBefore.items.find((item) => item.sku === sku);
  if (existing !== undefined) {
    return refused(`${sku} is already in the cart (quantity ${existing.quantity}). Not adding it again.`);
  }
  const response = await storeRequest(new URL("/api/cart", ctx.storeUrl), {
    method: "POST",
    headers: {
      Cookie: `cart_id=${ctx.cartId}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ sku, slug: product.slug }),
  });
  if (response.status !== 303) throw new StoreError(`add returned HTTP ${response.status}, not 303`);
  const location = response.headers.get("location");
  if (location === null) throw new StoreError("add redirect is missing");
  let destination: URL;
  try {
    destination = new URL(location, ctx.storeUrl);
  } catch {
    throw new StoreError("invalid add redirect");
  }
  if (destination.searchParams.get("error") === "sold-out" || destination.pathname === "/search") {
    return refused(`${sku} is sold out or unavailable.`);
  }
  if (destination.pathname !== "/cart") throw new StoreError("unexpected add redirect");
  const cartAfter = await loadCart(ctx);
  return printed([
    `Added ${sku} (${product.name}, size ${variant.size}).`,
    JSON.stringify(cartAfter),
  ]);
}

async function previewCheckout(ctx: ShopContext): Promise<ShopResult> {
  const cart = await loadCart(ctx);
  const lines: string[] = [];
  if (cart.items.length === 0) {
    lines.push("Cart is empty; nothing would be ordered.");
  } else {
    lines.push("Would order:");
    for (const item of cart.items) {
      lines.push([
        item.sku,
        item.name,
        `size ${item.size}`,
        `qty ${item.quantity}`,
        `$${item.priceUsd} each`,
        `$${item.priceUsd * item.quantity}`,
      ].join("\t"));
    }
    lines.push(`Total: $${cart.totalUsd}`);
  }
  lines.push("Dry run: no order was placed.");
  return printed(lines);
}

export async function runShop(
  args: string[],
  ctx: { storeUrl: string; cartId: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const commandArgs: string[] = [];
    for (let index = 0; index < args.length; index++) {
      const argument = args[index]!;
      if (argument === "--qty" || argument.startsWith("--qty=")) {
        const quantity = argument === "--qty" ? args[++index] : argument.slice("--qty=".length);
        if (quantity !== "1") return refused("only quantity 1 per add is supported");
      } else {
        commandArgs.push(argument);
      }
    }
    if (commandArgs.length === 0 ||
        (commandArgs.length === 1 && (commandArgs[0] === "help" || commandArgs[0] === "--help"))) {
      return { stdout: usage, stderr: "", exitCode: 0 };
    }
    const command = commandArgs[0];
    if (command === "search") return searchProducts(commandArgs.slice(1));
    if (command === "product") return describeProduct(commandArgs.slice(1), args);
    if (command === "cart") {
      if (commandArgs[1] === "add") return await addSku(commandArgs.slice(2), ctx);
      if (commandArgs[1] === "show" &&
          (commandArgs.length === 2 || (commandArgs.length === 3 && commandArgs[2] === "--json"))) {
        return printed([JSON.stringify(await loadCart(ctx))]);
      }
    }
    if (command === "checkout") {
      if (commandArgs.length === 1) {
        return refused("checkout needs human approval and is not available to agents. Use --dry-run to preview.");
      }
      if (commandArgs.length === 2 && commandArgs[1] === "--dry-run") return await previewCheckout(ctx);
    }
    return unknownCommand(args);
  } catch (error: unknown) {
    if (error instanceof InputError) return refused(error.message, true);
    const reason = error instanceof StoreError ? error.message : "unexpected response";
    return { stdout: "", stderr: `shop: could not reach the store (${reason})\n`, exitCode: 2 };
  }
}