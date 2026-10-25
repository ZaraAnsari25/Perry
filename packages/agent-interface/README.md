# @agentfix/agent-interface

A **verified command interface built from the store's own data**. Outside shopping agents only see a store's web pages, one page at a time. This package gives agents that use tools a different way in: `shop` commands that read the catalog (`apps/storefront/lib/catalog.ts`, read-only) at call time and act on the store's **real** cart. Nothing is scraped, copied or regenerated, and every command is checked by contract tests.

Two ways to use it:
- **Perry's test agent** runs `shop` through **one sandboxed bash tool** (just-bash 3.6.0). This is the measured "agent interface" condition in the three-way comparison.
- **Real outside agents** (Claude Desktop, Claude Code) use the same behavior through the **`perry-shop` MCP server**.

Both are thin wrappers around `runShop` in `core.ts`, so one implementation and one set of tests cover every way in.

## `shop`

| Command | Behavior | Exit |
|---|---|---|
| `shop`, `shop help`, `shop --help` | Usage | 0 |
| `shop search [--color C] [--category C] [--min-price N] [--max-price N] [--size N] [--in-stock] [words...] [--json] [--limit N]` | A count line, then one tab-separated row per matching variant (`SKU name color category $price size N stock N`, or `sold out`). With fewer than 3 matches, up to 3 **near misses** (products failing exactly one filter, with the reason). `0 matches` is a valid answer. `--json` prints only an array of rows. Rows are capped at `--limit` (default 20). | 0 / 1 |
| `shop product <slug-or-SKU> [--json]` | Name, color, category, price, description, then a `size SKU stock` table | 0 / 1 |
| `shop cart add <SKU>` | Refuses unknown, sold-out (with in-stock alternatives) and already-in-cart SKUs **before** posting anything; otherwise adds quantity 1 and prints the full cart as JSON | 0 / 1 / 2 |
| `shop cart show [--json]` | The real cart as one JSON line (names, sizes, prices from the catalog; quantities from the store) | 0 / 2 |
| `shop checkout --dry-run` | What would be ordered; **never places an order** | 0 / 2 |
| `shop checkout` | Refused: checkout needs human approval | 1 |

Exit codes: **0** success, **1** the agent's mistake (the message says what to do next), **2** a system problem (store unreachable, timeout). `--qty` above 1 is refused.

### How it talks to the store

Only the given `storeUrl`, with a 5-second timeout. The storefront needs no changes.
- `GET /api/cart?cartId=<cartId>` reads the cart (the source of truth).
- `POST /api/cart` with form fields `sku` and `slug` and cookie `cart_id=<cartId>`, `redirect: "manual"`, exactly like the product page's add-to-cart form. A 303 to `/cart` means added; a 303 to `?error=sold-out` or `/search` means unavailable; anything else is exit 2.

## The guide

`buildGuide(catalog)` is the agent's first message: what the store sells, every command, and one worked example. Its numbers come from the catalog, and the example is real `searchCatalog` output for a query that is **not** the demo task's, so the guide never hands the agent the answer.

## Sandbox

`createAgentShell({ storeUrl, cartId })` returns a fresh sandbox per run, with `shop` as the only way to reach the store. It has no store files, no real shell or filesystem, no network (`curl` and `wget` don't exist), no Python and no JavaScript, plus just-bash's `hardened` limits and 10 seconds per command. Pipes, `jq` and `xargs` work (`shop search … --json | jq -r '.[0].sku' | xargs shop cart add`). Output over 8,000 characters is cut with a note. `exec` never throws.

## MCP server (`perry-shop`)

`npm run mcp -w @agentfix/agent-interface` starts the server over stdio. Each server process gets **one fresh cart**; its ID is logged to stderr (stdout is the MCP channel) and shown by `cart_show`. The store URL comes from `STORE_URL` (default `http://localhost:3001`).

| Tool | Inputs | Same as |
|---|---|---|
| `search` | `color?`, `category?`, `min_price?`, `max_price?`, `size?`, `in_stock?`, `words?`, `limit?` | `shop search …` |
| `product` | `slug_or_sku` | `shop product …` |
| `cart_add` | `sku` | `shop cart add …` |
| `cart_show` | none | `shop cart show`, plus the cart ID |
| `checkout_preview` | none | `shop checkout --dry-run` |

No tool places an order. The server's instructions are the guide without the bash-only line.

### Add it to Claude Code

```bash
claude mcp add perry-shop -e STORE_URL=http://localhost:3001 -- node ~/Perry/packages/agent-interface/scripts/mcp.ts
```

### Add it to Claude Desktop (macOS)

Claude menu (in the macOS menu bar) → **Settings… → Developer → Edit Config**, which opens `~/Library/Application Support/Claude/claude_desktop_config.json`. Add this under `mcpServers`, keeping any servers already there. Use absolute paths: Claude Desktop doesn't see nvm's `PATH`, so `command` is the full path from `which node`.

```json
{
  "mcpServers": {
    "perry-shop": {
      "command": "/Users/michellelu/.nvm/versions/node/v22.21.0/bin/node",
      "args": ["/Users/michellelu/Perry/packages/agent-interface/scripts/mcp.ts"],
      "env": { "STORE_URL": "http://localhost:3001" }
    }
  }
}
```

Quit Claude Desktop completely and reopen it. The tools appear under the **+** button → **Connectors**. If the server doesn't connect, read `~/Library/Logs/Claude/mcp-server-perry-shop.log` (it also holds the cart ID line).

### Check a purchase

```bash
npm run verify-cart -w @agentfix/agent-interface -- <cartId> [expectedSku]   # default VEL-BLK-08
```

Runs Perry's cart verifier (read-only) against the store and prints `VERIFIED` or why not.

## Tests

```bash
npm test -w @agentfix/agent-interface                                   # unit, contract, guide, sandbox and MCP tests; no network
STORE_URL=http://localhost:3001 npm test -w @agentfix/agent-interface   # plus the integration test against a running store
```

The **search contract tests** are Perry's gate for the interface, like the build and catalog checks are for a Droid fix. Over 5,184 filter combinations they check, against an answer computed independently from the catalog, that search is **sound** (every row satisfies every filter and matches the catalog) and **complete** (every matching variant is returned with the right total), and that near misses never match.

## Export for the dashboard

`npm run interface:export` writes the guide to `data/results/agent-guide.json` (gitignored) for the dashboard's "What the agent sees".

## Limits

It covers only what its commands cover, and it works where we control the catalog and the cart API. Text-heavy content (policies, help articles) as files is a possible next step.
