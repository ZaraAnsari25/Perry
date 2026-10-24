// Unit tests for ref resolution. No browser, no API cost.

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveRef } from "./index.ts";

const outline = `Page: /search
- link "View details" [ref=f3e112] [cursor=pointer]:
  - /url: /products/tempo-lite
- link "View details" [ref=f3e113] [cursor=pointer]:
  - /url: /products/velocity-runner`;

test("exact refs resolve", () => {
  assert.equal(resolveRef("f3e113", outline), "f3e113");
});

test("a ref missing its frame prefix resolves to the unique match", () => {
  assert.equal(resolveRef("e113", outline), "f3e113");
});

test("bracketed and ref= forms resolve", () => {
  assert.equal(resolveRef("[ref=f3e112]", outline), "f3e112");
  assert.equal(resolveRef("ref=f3e112", outline), "f3e112");
  assert.equal(resolveRef(" f3e112 ", outline), "f3e112");
});

test("unknown refs fail with a clear message", () => {
  assert.throws(() => resolveRef("e999", outline), /No element with ref "e999".*e\.g\. "f3e113"/);
  assert.throws(() => resolveRef(undefined, outline), /No element with ref/);
});

test("a suffix shared with a longer ref does not match", () => {
  // e13 must not match f3e113.
  assert.throws(() => resolveRef("e13", outline), /No element with ref "e13"/);
});

test("first-page refs without a prefix still resolve exactly", () => {
  assert.equal(resolveRef("e13", `- searchbox "Search products" [ref=e13]`), "e13");
});
