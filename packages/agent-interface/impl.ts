// Which `shop` implementation runs: PERRY_SHOP_IMPL = "generated" (default:
// generated/core.ts, written by Droid and accepted by Perry's gates, then copied
// in with `npm run use:generated`) or "handwritten" (core.ts, the reference and
// fallback).

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runShop as handwritten, type ShopContext, type ShopResult } from "./core.ts";

export type ShopImplementation = "handwritten" | "generated";
export type RunShop = (args: string[], ctx: ShopContext) => Promise<ShopResult>;

const GENERATED = new URL("./generated/core.ts", import.meta.url);

/** The implementation PERRY_SHOP_IMPL asks for. Throws a clear error for a bad value or a missing generated file. */
export async function loadShop(
  choice: string = process.env.PERRY_SHOP_IMPL || "generated",
): Promise<{ implementation: ShopImplementation; runShop: RunShop }> {
  if (choice === "handwritten") return { implementation: "handwritten", runShop: handwritten };
  if (choice !== "generated")
    throw new Error(`PERRY_SHOP_IMPL must be "handwritten" or "generated", not "${choice}".`);
  if (!existsSync(GENERATED))
    throw new Error(
      `The generated shop commands (${fileURLToPath(GENERATED)}) don't exist. ` +
        "Run npm run generate:interface, then npm run use:generated, or set PERRY_SHOP_IMPL=handwritten.",
    );
  const { runShop } = (await import(GENERATED.href)) as { runShop?: RunShop };
  if (typeof runShop !== "function") throw new Error(`${fileURLToPath(GENERATED)} doesn't export runShop.`);
  return { implementation: "generated", runShop };
}
