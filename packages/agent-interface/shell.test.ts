import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, test } from "node:test";

import { catalog } from "../../apps/storefront/lib/catalog.ts";
import { buildGuide } from "./guide.ts";
import { MAX_OUTPUT_CHARS, createAgentShell } from "./shell.ts";

const STORE = "http://store.test";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const shell = () => createAgentShell({ storeUrl: STORE, cartId: "cart-1" });

test("the guide is the agent's first message", async () => {
  assert.equal((await shell()).guide, buildGuide(catalog));
});

test("pipes, jq and xargs work with shop", async () => {
  const sh = await shell();
  const skus = await sh.exec("shop search --color black --size 8 --in-stock --json | jq -r '.[].sku'");
  assert.equal(skus.exitCode, 0, skus.stderr);
  assert.deepEqual(skus.stdout.trim().split("\n"), ["SUM-BLK-08", "STR-BLK-08", "VEL-BLK-08"]);

  const posts: string[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(String(init.body));
      return new Response(null, { status: 303, headers: { location: `${STORE}/cart` } });
    }
    return Response.json({ items: posts.length ? [{ sku: "VEL-BLK-08", quantity: 1 }] : [] });
  }) as typeof fetch;
  const add = await sh.exec(
    "shop search --color black --category running --max-price 120 --size 8 --in-stock --json | jq -r '.[0].sku' | xargs shop cart add",
  );
  assert.equal(add.exitCode, 0, add.stderr);
  assert.match(add.stdout, /^Added VEL-BLK-08 \(Velocity Runner, size 8\)\./);
  assert.deepEqual(posts, ["sku=VEL-BLK-08&slug=velocity-runner"]);
});

test("shop's exit codes reach the agent", async () => {
  const sh = await shell();
  const r = await sh.exec("shop cart add NOPE-01");
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /unknown SKU/);
});

test("no store files, network, Python or JavaScript", async () => {
  const sh = await shell();
  assert.equal((await sh.exec("ls /")).stdout.includes("store"), false);
  const curl = await sh.exec("curl http://example.com");
  assert.notEqual(curl.exitCode, 0);
  assert.match(curl.stderr, /not found/);
  for (const cmd of ["python3 -c 1", "js-exec 1", "node -e 1", "wget http://example.com"])
    assert.notEqual((await sh.exec(cmd)).exitCode, 0, cmd);
});

test("long output is truncated with a note", async () => {
  const sh = await shell();
  const r = await sh.exec("seq 1 5000");
  assert.equal(r.exitCode, 0);
  assert.ok(r.stdout.startsWith("1\n2\n3\n"));
  assert.ok(r.stdout.endsWith(`[output truncated at ${MAX_OUTPUT_CHARS} characters; narrow your search with more flags or --limit]`));
  assert.ok(r.stdout.length < MAX_OUTPUT_CHARS + 200);
});

test("exec never throws, even on garbage", async () => {
  const sh = await shell();
  for (const cmd of ["))) (((", "", "'unterminated", "$(", "shop cart add $(cat /nope)"]) {
    const r = await sh.exec(cmd);
    assert.equal(typeof r.exitCode, "number", cmd);
    assert.equal(typeof r.durationMs, "number", cmd);
  }
  assert.notEqual((await sh.exec("))) (((")).exitCode, 0);
});

test("each run gets a fresh sandbox", async () => {
  const a = await shell();
  const b = await shell();
  await a.exec("echo note > /home/agent/x");
  assert.equal((await a.exec("cat /home/agent/x")).stdout, "note\n");
  assert.notEqual((await b.exec("cat /home/agent/x")).exitCode, 0);
});

test("PERRY_SHOP_IMPL picks the implementation (Droid's generated one by default); a missing generated one fails clearly", async () => {
  const saved = process.env.PERRY_SHOP_IMPL;
  try {
    process.env.PERRY_SHOP_IMPL = "handwritten";
    assert.equal((await shell()).implementation, "handwritten");
    process.env.PERRY_SHOP_IMPL = "nonsense";
    await assert.rejects(shell(), /must be "handwritten" or "generated"/);
    for (const choice of [undefined, "generated"]) {
      if (choice === undefined) delete process.env.PERRY_SHOP_IMPL;
      else process.env.PERRY_SHOP_IMPL = choice;
      if (!existsSync(new URL("./generated/core.ts", import.meta.url))) await assert.rejects(shell(), /don't exist/);
      else assert.equal((await shell()).implementation, "generated");
    }
  } finally {
    if (saved === undefined) delete process.env.PERRY_SHOP_IMPL;
    else process.env.PERRY_SHOP_IMPL = saved;
  }
});
