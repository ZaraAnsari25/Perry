import assert from "node:assert/strict";
import { test } from "node:test";

import { catalog } from "../../apps/storefront/lib/catalog.ts";
import { buildGuide } from "./guide.ts";

test("has a guide", () => {
  assert.ok(buildGuide(catalog));
});
