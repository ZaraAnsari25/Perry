import assert from "node:assert/strict";
import { test } from "node:test";

import { catalog } from "../../apps/storefront/lib/catalog.ts";
import { GUIDE_EXAMPLE, buildGuide } from "./guide.ts";
import { formatSearch, searchCatalog } from "./search.ts";

const guide = buildGuide(catalog);

test("mentions every subcommand", () => {
  for (const c of ["shop search", "shop product", "shop cart add", "shop cart show", "shop checkout --dry-run"]) assert.ok(guide.includes(c), c);
});

test("its numbers match the catalog", () => {
  const sizes = catalog.flatMap((p) => p.variants.map((v) => v.size));
  const running = catalog.filter((p) => p.category === "running").length;
  const hiking = catalog.filter((p) => p.category === "hiking").length;
  assert.ok(guide.includes(`sells ${catalog.length} products (${running} running, ${hiking} hiking)`));
  assert.ok(guide.includes(`in sizes ${Math.min(...sizes)}–${Math.max(...sizes)}.`));
});

test("the example is real searchCatalog output", () => {
  const example = `$ ${GUIDE_EXAMPLE.command}\n${formatSearch(searchCatalog(catalog, GUIDE_EXAMPLE.filters))}`;
  assert.ok(guide.endsWith(example));
  assert.match(guide, /\nAER-WHT-09\tAero Pace\twhite\trunning\t\$79\tsize 9\tstock 2\n/);
});

test("never hands the agent the demo answer", () => {
  assert.ok(!guide.includes("VEL-BLK-08"));
  assert.ok(!guide.includes("Velocity Runner"));
  assert.ok(!/--color black/.test(guide));
  assert.ok(!/--size 8\b/.test(guide));
});
