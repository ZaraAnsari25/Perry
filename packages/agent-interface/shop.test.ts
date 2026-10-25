import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { catalog, findVariant, type Product } from "../../apps/storefront/lib/catalog.ts";
import { verifyCart } from "@agentfix/verifier";
import type { VariantRow } from "./search.ts";
import { runShop } from "./test-impl.ts";

const STORE = "http://store.test";
const ctx = { storeUrl: STORE, cartId: "cart-1" };
const shop = (line: string) => runShop(line.split(" ").filter(Boolean), ctx);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A fake storefront cart API that behaves like apps/storefront/app/api/cart/route.ts. */
function fakeStore(options: { failWith?: Error; postRedirect?: string } = {}) {
  const cart = new Map<string, number>();
  const calls: { method: string; url: string; body?: string; cookie?: string }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const form = init?.body instanceof FormData ? init.body : new URLSearchParams(String(init?.body ?? ""));
    const body = init?.body === undefined ? undefined : `sku=${form.get("sku")}&slug=${form.get("slug")}`;
    calls.push({ method, url: url.href, body, cookie: new Headers(init?.headers).get("cookie") ?? undefined });
    if (options.failWith) throw options.failWith;
    assert.equal(url.origin, STORE, "shop only contacts the store URL");
    if (method === "GET")
      return Response.json({ cartId: url.searchParams.get("cartId"), items: [...cart].map(([sku, quantity]) => ({ sku, quantity })) });
    if (options.postRedirect) return new Response(null, { status: 303, headers: { location: `${STORE}${options.postRedirect}` } });
    const sku = String(form.get("sku") ?? "");
    const match = findVariant(sku);
    if (!match || match.variant.stock === 0)
      return new Response(null, { status: 303, headers: { location: `${STORE}/products/${form.get("slug")}?error=sold-out` } });
    cart.set(sku, (cart.get(sku) ?? 0) + 1);
    return new Response(null, { status: 303, headers: { location: `${STORE}/cart` } });
  }) as typeof fetch;
  return { cart, calls, posts: () => calls.filter((c) => c.method === "POST") };
}

test("help lists every command", async () => {
  for (const line of ["", "help", "--help"]) {
    const r = await shop(line);
    assert.equal(r.exitCode, 0);
    for (const c of ["shop search", "shop product", "shop cart add", "shop cart show", "shop checkout --dry-run"])
      assert.ok(r.stdout.includes(c), `${line || "(none)"}: ${c}`);
  }
});

test("the agent's mistakes are exit 1 and send nothing", async () => {
  const store = fakeStore();
  assert.equal((await shop("frobnicate")).exitCode, 1);
  const missing = await shop("cart add");
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.stderr, "shop: missing SKU. Usage: shop cart add <SKU>\n");
  const qty = await shop("cart add VEL-BLK-08 --qty 2");
  assert.equal(qty.exitCode, 1);
  assert.match(qty.stderr, /only quantity 1 per add is supported/);
  assert.equal(store.calls.length, 0);
});

test("unknown SKU: exit 1 and no request", async () => {
  const store = fakeStore();
  const r = await shop("cart add NOPE-01");
  assert.equal(r.exitCode, 1);
  assert.equal(r.stderr, 'shop: unknown SKU "NOPE-01". Find SKUs with shop search or shop product <slug>.\n');
  assert.equal(store.calls.length, 0);
});

test("sold-out SKU: exit 1, no request, in-stock alternatives listed", async () => {
  const store = fakeStore();
  const r = await shop("cart add TMP-BLK-08");
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /^shop: TMP-BLK-08 \(Tempo Lite, size 8\) is sold out\.\nIn stock instead:\n/);
  const alts = r.stderr.split("\n").filter((l) => l.includes("\t"));
  assert.ok(alts.length > 0 && alts.length <= 3);
  for (const line of alts) assert.ok((findVariant(line.split("\t")[0]!)?.variant.stock ?? 0) > 0, line);
  assert.equal(store.calls.length, 0);
});

test("add: a 303 to /cart is success and prints the full cart", async () => {
  const store = fakeStore();
  const r = await shop("cart add VEL-BLK-08");
  assert.equal(r.exitCode, 0, r.stderr);
  assert.equal(
    r.stdout,
    'Added VEL-BLK-08 (Velocity Runner, size 8).\n{"items":[{"sku":"VEL-BLK-08","name":"Velocity Runner","size":8,"priceUsd":98,"quantity":1}],"totalUsd":98}\n',
  );
  const [post] = store.posts();
  assert.equal(post?.cookie, "cart_id=cart-1");
  assert.equal(post?.body, "sku=VEL-BLK-08&slug=velocity-runner");
  assert.equal((await shop("cart add VEL-BLK-08 --qty 1")).exitCode, 1, "--qty 1 is accepted, then refused as a duplicate");
});

test("a duplicate add is refused without a POST", async () => {
  const store = fakeStore();
  await shop("cart add VEL-BLK-08");
  const r = await shop("cart add VEL-BLK-08");
  assert.equal(r.exitCode, 1);
  assert.equal(r.stderr, "shop: VEL-BLK-08 is already in the cart (quantity 1). Not adding it again.\n");
  assert.equal(store.posts().length, 1);
  assert.equal(store.cart.get("VEL-BLK-08"), 1);
});

test("the store answering sold-out is exit 1", async () => {
  const store = fakeStore({ postRedirect: "/products/velocity-runner?error=sold-out" });
  const r = await shop("cart add VEL-BLK-08");
  assert.equal(r.exitCode, 1);
  assert.equal(r.stderr, "shop: VEL-BLK-08 is sold out or unavailable.\n");
  assert.equal(store.cart.size, 0);
});

test("an unreachable or odd store is a system problem (exit 2)", async () => {
  fakeStore({ failWith: new TypeError("fetch failed") });
  for (const line of ["cart add VEL-BLK-08", "cart show", "checkout --dry-run"]) {
    const r = await shop(line);
    assert.equal(r.exitCode, 2, line);
    assert.match(r.stderr, /^shop: could not reach the store \(.+\)\n/);
  }
  fakeStore({ postRedirect: "/somewhere-else" });
  assert.equal((await shop("cart add VEL-BLK-08")).exitCode, 2);
});

test("cart show prints the cart as JSON", async () => {
  fakeStore();
  for (const line of ["cart show", "cart show --json"]) {
    const r = await shop(line);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(JSON.parse(r.stdout), { items: [], totalUsd: 0 });
  }
});

test("checkout without --dry-run is refused; a dry run lists name, size and price from the catalog", async () => {
  const store = fakeStore();
  const refused = await shop("checkout");
  assert.equal(refused.exitCode, 1);
  assert.equal(refused.stderr, "shop: checkout needs human approval and is not available to agents. Use --dry-run to preview.\n");
  assert.match((await shop("checkout --dry-run")).stdout, /^Cart is empty/);
  await shop("cart add VEL-BLK-08");
  const r = await shop("checkout --dry-run");
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "Would order:\nVEL-BLK-08\tVelocity Runner\tsize 8\tqty 1\t$98 each\t$98\nTotal: $98\nDry run: no order was placed.\n");
  assert.equal(store.posts().length, 1);
});

test("search output: count line, rows, near misses, --json, bad flags", async () => {
  const demo = await shop("search --color black --category running --max-price 120 --size 8 --in-stock");
  assert.equal(demo.exitCode, 0);
  const lines = demo.stdout.trimEnd().split("\n");
  assert.equal(lines[0], "1 match (showing 1)");
  assert.equal(lines[1], "VEL-BLK-08\tVelocity Runner\tblack\trunning\t$98\tsize 8\tstock 3");
  assert.equal(lines[2], "Near misses:");
  assert.ok(lines.includes("  Tempo Lite: size 8 is sold out"));

  const json = await shop("search --color black --category running --max-price 120 --size 8 --in-stock --json");
  assert.deepEqual((JSON.parse(json.stdout) as VariantRow[]).map((r) => r.sku), ["VEL-BLK-08"]);

  const none = await shop("search --color black --category running --max-price 90 --size 8 --in-stock");
  assert.equal(none.exitCode, 0);
  assert.match(none.stdout, /^0 matches\n/);

  const total = catalog.reduce((n, p) => n + p.variants.length, 0);
  const many = await shop("search --limit 5");
  assert.match(many.stdout, new RegExp(`^${total} matches \\(showing 5\\); narrow with --max-price or --size\\n`));
  assert.match((await shop("search --max-price=90 --json")).stdout, /^\[/);
  assert.match((await shop("search racer")).stdout, /^4 matches \(showing 4\)\nSTR-BLK-07/);
  assert.match((await shop("search")).stdout, /sold out/, "sold-out variants show without --in-stock");

  for (const bad of ["search --size abc", "search --colour black", "search --limit 0", "search --max-price"])
    assert.equal((await shop(bad)).exitCode, 1, bad);
});

test("shop product: the size table matches the catalog for every product, by slug or SKU", async () => {
  for (const p of catalog) {
    for (const key of [p.slug, p.variants.at(-1)!.sku]) {
      const r = await shop(`product ${key}`);
      assert.equal(r.exitCode, 0);
      const [head, description, header, ...table] = r.stdout.trimEnd().split("\n");
      assert.equal(head, `${p.name}\t${p.color}\t${p.category}\t$${p.priceUsd}`);
      assert.equal(description, p.description);
      assert.equal(header, "size\tSKU\tstock");
      assert.deepEqual(table, p.variants.map((v) => `${v.size}\t${v.sku}\t${v.stock > 0 ? v.stock : "sold out"}`));
    }
    const json = JSON.parse((await shop(`product ${p.slug} --json`)).stdout) as Product;
    assert.deepEqual(json.variants.map(({ size, sku, stock }) => ({ size, sku, stock })), p.variants);
    assert.equal(json.priceUsd, p.priceUsd);
  }
  const unknown = await shop("product moon-boot");
  assert.equal(unknown.exitCode, 1);
  assert.equal(unknown.stderr, 'shop: no product "moon-boot". Try shop search.\n');
});

// ---------------------------------------------------------------------------
// Integration against a running storefront (skipped unless STORE_URL is set)
// ---------------------------------------------------------------------------

const live = process.env.STORE_URL;

test("integration: buys VEL-BLK-08 on the real cart, refuses duplicates and sold-out, and verifies", { skip: !live && "set STORE_URL" }, async () => {
  const real = { storeUrl: live!, cartId: crypto.randomUUID() };
  const readItems = async () => {
    const url = new URL("/api/cart", live);
    url.searchParams.set("cartId", real.cartId);
    return ((await (await fetch(url)).json()) as { items: unknown }).items;
  };
  const added = await runShop(["cart", "add", "VEL-BLK-08"], real);
  assert.equal(added.exitCode, 0, added.stderr);
  assert.deepEqual(await readItems(), [{ sku: "VEL-BLK-08", quantity: 1 }]);
  assert.equal((await runShop(["cart", "add", "VEL-BLK-08"], real)).exitCode, 1);
  assert.equal((await runShop(["cart", "add", "TMP-BLK-08"], real)).exitCode, 1);
  assert.deepEqual(await readItems(), [{ sku: "VEL-BLK-08", quantity: 1 }]);

  const verdict = await verifyCart({ url: live!, cartId: real.cartId, expectedSku: "VEL-BLK-08", agentClaimedDone: true });
  assert.equal(verdict.success, true, verdict.reason);
});
