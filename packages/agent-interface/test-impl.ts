// Which runShop the contract tests check: SHOP_IMPL unset = the hand-written
// core.ts, "generated" = generated/core.ts, or a path to any implementation.

import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ShopContext, ShopResult } from "./core.ts";

const impl = process.env.SHOP_IMPL;
const file =
  !impl || impl === "handwritten"
    ? new URL("./core.ts", import.meta.url)
    : impl === "generated"
      ? new URL("./generated/core.ts", import.meta.url)
      : pathToFileURL(isAbsolute(impl) ? impl : resolve(impl));

export const implementationUnderTest = impl ?? "handwritten";
export const runShop = ((await import(file.href)) as { runShop: (args: string[], ctx: ShopContext) => Promise<ShopResult> })
  .runShop;
