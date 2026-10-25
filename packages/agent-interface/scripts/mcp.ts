// Starts the perry-shop MCP server over stdio, with one fresh cart. stdout is
// the MCP channel, so everything else goes to stderr.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadShop } from "../impl.ts";
import { createShopServer } from "../mcp.ts";

const storeUrl = process.env.STORE_URL ?? "http://localhost:3001";
const cartId = crypto.randomUUID();

const { implementation, runShop } = await loadShop().catch((error: Error) => {
  console.error(`perry-shop MCP server: ${error.message}`);
  process.exit(1);
});

await createShopServer({ storeUrl, cartId }, runShop).connect(new StdioServerTransport());
console.error(`perry-shop MCP server: store ${storeUrl}, cart id ${cartId}, ${implementation} shop commands`);

// Which commands this cart's session used, so `verify-cart --save` can record it.
const sessions = join(dirname(fileURLToPath(import.meta.url)), "../../../data/results/mcp-sessions");
await mkdir(sessions, { recursive: true })
  .then(() =>
    writeFile(join(sessions, `${cartId}.json`), JSON.stringify({ cartId, storeUrl, implementation, startedAt: new Date().toISOString() }) + "\n"),
  )
  .catch((error: Error) => console.error(`perry-shop MCP server: couldn't record the session (${error.message})`));
