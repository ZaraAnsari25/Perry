import assert from "node:assert/strict";
import { test } from "node:test";

import { catalog } from "../../apps/storefront/lib/catalog.ts";
import { searchCatalog } from "./search.ts";

test("returns a result shape", () => {
  assert.equal(typeof searchCatalog(catalog, {}).total, "number");
});
