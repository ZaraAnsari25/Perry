// The `shop` command inside the sandbox: a thin wrapper around runShop.

import { defineCommand, type Command } from "just-bash";

import { runShop } from "./core.ts";
import type { RunShop } from "./impl.ts";

/** `run` defaults to the hand-written runShop; createAgentShell passes the one PERRY_SHOP_IMPL chose. */
export function createShopCommand({ storeUrl, cartId }: { storeUrl: string; cartId: string }, run: RunShop = runShop): Command {
  return defineCommand("shop", (args) => run(args, { storeUrl, cartId }));
}
