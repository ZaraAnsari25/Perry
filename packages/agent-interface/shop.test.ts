import assert from "node:assert/strict";
import { test } from "node:test";

import { runShop } from "./core.ts";

test("runShop returns an exit code", async () => {
  assert.equal(typeof (await runShop(["help"], { storeUrl: "http://localhost:3001", cartId: "c" })).exitCode, "number");
});
