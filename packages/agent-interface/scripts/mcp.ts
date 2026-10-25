// Starts the perry-shop MCP server over stdio, with one fresh cart. stdout is
// the MCP channel, so everything else goes to stderr.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createShopServer } from "../mcp.ts";

const storeUrl = process.env.STORE_URL ?? "http://localhost:3001";
const cartId = crypto.randomUUID();

await createShopServer({ storeUrl, cartId }).connect(new StdioServerTransport());
console.error(`perry-shop MCP server: store ${storeUrl}, cart id ${cartId}`);
