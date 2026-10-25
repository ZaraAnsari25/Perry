import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentShell } from "./shell.ts";

test("runs commands in a sandbox", async () => {
  const shell = await createAgentShell({ storeUrl: "http://localhost:3001", cartId: "c" });
  assert.ok(shell.guide);
  assert.equal((await shell.exec("echo hi")).stdout, "hi\n");
});
