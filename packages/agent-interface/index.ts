// Agent interface: `shop` commands built from the store's own data, used
// through one sandboxed bash tool. See README.md.

export { buildGuide } from "./guide.ts";
export { searchCatalog, type NearMiss, type SearchFilters, type VariantRow } from "./search.ts";
export { runShop, type ShopContext, type ShopResult } from "./core.ts";
export { createShopCommand } from "./shop.ts";
export { MAX_OUTPUT_CHARS, createAgentShell, type AgentShell, type ShellResult } from "./shell.ts";
