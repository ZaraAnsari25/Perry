import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { runShop } from "./core.ts";
import { createShopServer, mcpInstructions } from "./mcp.ts";

const STORE = "http://store.test";
const ctx = { storeUrl: STORE, cartId: "cart-1" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createShopServer(ctx).connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) => (r.content as { type: string; text: string }[])[0]?.text ?? "";

test("lists exactly the five tools; none places an order", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["cart_add", "cart_show", "checkout_preview", "product", "search"]);
  assert.ok(!tools.some((t) => /^(checkout|order|buy|purchase)$/.test(t.name)));
  assert.equal(client.getInstructions(), mcpInstructions());
  assert.ok(!mcpInstructions().includes("bash"));
});

test("search returns the same result as runShop for the demo query", async () => {
  const client = await connect();
  const r = await client.callTool({
    name: "search",
    arguments: { color: "black", category: "running", max_price: 120, size: 8, in_stock: true },
  });
  const direct = await runShop(["search", "--color", "black", "--category", "running", "--max-price", "120", "--size", "8", "--in-stock"], ctx);
  assert.equal(r.isError, undefined);
  assert.equal(text(r), direct.stdout);
  assert.match(text(r), /^1 match \(showing 1\)\nVEL-BLK-08\t/);
});

test("product and refusals match runShop; errors are isError", async () => {
  const client = await connect();
  assert.equal(text(await client.callTool({ name: "product", arguments: { slug_or_sku: "aero-pace" } })), (await runShop(["product", "aero-pace"], ctx)).stdout);
  const unknown = await client.callTool({ name: "cart_add", arguments: { sku: "NOPE-01" } });
  assert.equal(unknown.isError, true);
  assert.match(text(unknown), /unknown SKU "NOPE-01"/);
});

test("cart_add, cart_show and checkout_preview use the real cart API", async () => {
  const items: { sku: string; quantity: number }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(String(input)).origin, STORE);
    if (init?.method === "POST") {
      items.push({ sku: new URLSearchParams(String(init.body)).get("sku")!, quantity: 1 });
      return new Response(null, { status: 303, headers: { location: `${STORE}/cart` } });
    }
    return Response.json({ items });
  }) as typeof fetch;
  const client = await connect();
  const added = await client.callTool({ name: "cart_add", arguments: { sku: "VEL-BLK-08" } });
  assert.equal(added.isError, undefined, text(added));
  assert.match(text(added), /^Added VEL-BLK-08 \(Velocity Runner, size 8\)\./);
  const shown = text(await client.callTool({ name: "cart_show", arguments: {} }));
  assert.match(shown, /"sku":"VEL-BLK-08"/);
  assert.match(shown, /\ncart id: cart-1\n$/);
  assert.match(text(await client.callTool({ name: "checkout_preview", arguments: {} })), /Dry run: no order was placed\./);
  assert.equal(items.length, 1);
});
