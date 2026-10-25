// MCP server for real outside agents (Claude Desktop, Claude Code): the same
// verified `shop` behavior as the sandbox, through a thin wrapper around runShop.
// One cart per server. No tool places an order.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { catalog } from "../../apps/storefront/lib/catalog.ts";
import { runShop, type ShopContext } from "./core.ts";
import { BASH_ONLY_LINES, buildGuide } from "./guide.ts";

/** The guide without the bash-only lines, plus how the commands map to tools. */
export function mcpInstructions(): string {
  const guide = buildGuide(catalog)
    .split("\n")
    .filter((line) => !BASH_ONLY_LINES.includes(line))
    .join("\n");
  return `${guide}
The tools search, product, cart_add, cart_show and checkout_preview do what the matching shop commands above do.
Prices, sizes and stock come from the store's catalog; the cart is the store's real cart. No tool places an order.
`;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function createShopServer(ctx: ShopContext): McpServer {
  const server = new McpServer({ name: "perry-shop", version: "0.0.0" }, { instructions: mcpInstructions() });

  const run = async (args: string[], suffix = ""): Promise<ToolResult> => {
    const r = await runShop(args, ctx);
    return r.exitCode === 0
      ? { content: [{ type: "text", text: r.stdout + suffix }] }
      : { content: [{ type: "text", text: r.stderr || r.stdout }], isError: true };
  };
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "search",
    {
      description:
        "Find product variants (one per size) matching every filter. Prints a count, tab-separated rows (SKU, name, color, category, price, size, stock) and near misses that do NOT match.",
      inputSchema: {
        color: z.string().optional(),
        category: z.string().optional().describe("e.g. running or hiking"),
        min_price: z.number().nonnegative().optional().describe("USD"),
        max_price: z.number().nonnegative().optional().describe("USD"),
        size: z.number().nonnegative().optional(),
        in_stock: z.boolean().optional().describe("only variants with stock"),
        words: z.array(z.string()).optional().describe("words that must appear in the name or description"),
        limit: z.number().int().min(1).optional().describe("maximum rows (default 20)"),
      },
      annotations: readOnly,
    },
    async (a) => {
      const args = ["search"];
      if (a.color !== undefined) args.push("--color", a.color);
      if (a.category !== undefined) args.push("--category", a.category);
      if (a.min_price !== undefined) args.push("--min-price", String(a.min_price));
      if (a.max_price !== undefined) args.push("--max-price", String(a.max_price));
      if (a.size !== undefined) args.push("--size", String(a.size));
      if (a.in_stock) args.push("--in-stock");
      if (a.limit !== undefined) args.push("--limit", String(a.limit));
      // Words are positional; one starting with "-" would read as a flag, so it can't be searched.
      for (const w of a.words ?? []) if (!w.startsWith("-")) args.push(w);
      return run(args);
    },
  );

  server.registerTool(
    "product",
    {
      description: "One product with its description and every size, SKU and stock level.",
      inputSchema: { slug_or_sku: z.string().describe("a product slug (e.g. aero-pace) or any of its SKUs") },
      annotations: readOnly,
    },
    async ({ slug_or_sku }) => run(["product", slug_or_sku]),
  );

  server.registerTool(
    "cart_add",
    {
      description:
        "Add one item (quantity 1) to the cart by SKU. Refuses unknown, sold-out and already-added SKUs. Prints the full cart. Does not place an order.",
      inputSchema: { sku: z.string().describe("e.g. AER-WHT-09") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ sku }) => run(["cart", "add", sku]),
  );

  server.registerTool(
    "cart_show",
    { description: "Show the cart, with its ID for verification.", inputSchema: {}, annotations: readOnly },
    async () => run(["cart", "show"], `cart id: ${ctx.cartId}\n`),
  );

  server.registerTool(
    "checkout_preview",
    { description: "Preview what would be ordered. Never places an order.", inputSchema: {}, annotations: readOnly },
    async () => run(["checkout", "--dry-run"]),
  );

  return server;
}
