// The `shop` command inside the sandbox: a thin wrapper around runShop.

import { defineCommand, type Command } from "just-bash";

import { runShop } from "./core.ts";

export function createShopCommand({ storeUrl, cartId }: { storeUrl: string; cartId: string }): Command {
  return defineCommand("shop", (args) => runShop(args, { storeUrl, cartId }));
}
