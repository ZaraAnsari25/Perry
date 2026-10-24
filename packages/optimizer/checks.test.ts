import assert from "node:assert/strict";
import { test } from "node:test";

import { DROID_ALLOWED_FILES, DROID_PROTECTED_PATHS } from "@agentfix/shared";

import { type CatalogProduct, checkChangedFiles, checkSearchPage } from "./checks.ts";

const catalog: CatalogProduct[] = [
  {
    slug: "tempo-lite",
    name: "Tempo Lite",
    category: "running",
    color: "black",
    priceUsd: 109,
    variants: [
      { size: 7, stock: 4 },
      { size: 8, stock: 0 },
    ],
  },
  {
    slug: "cloud-glide",
    name: "Cloud Glide",
    category: "running",
    color: "navy",
    priceUsd: 95,
    variants: [{ size: 8, stock: 5 }],
  },
];

// Page shell like the storefront's: header, h1, then a list of cards.
const page = (cards: string) => `<!doctype html><html><body>
  <header><a href="/">Shoe Shop</a> <a href="/cart">Cart</a></header>
  <main><section><h1>Results for "black running shoe"</h1><ul>${cards}</ul></section></main>
</body></html>`;

const card = (slug: string, name: string, body: string) =>
  `<li><h2>${name}</h2>${body}<a href="/products/${slug}">View details</a></li>`;

const goodPage = page(
  card(
    "tempo-lite",
    "Tempo Lite",
    `<p>$109</p><p>Color: black · Category: running</p>
     <ul><li>Size 7: In stock (4 left)</li><li>Size 8: Sold out</li></ul>`,
  ) +
    card(
      "cloud-glide",
      "Cloud Glide",
      `<p>$95</p><p>Color: navy</p><ul><li>Size 8: <span>In stock</span> (5 left)</li></ul>`,
    ),
);

const slugs = ["tempo-lite", "cloud-glide"];

test("allowlist: only allowed files pass", () => {
  assert.equal(checkChangedFiles([...DROID_ALLOWED_FILES], DROID_ALLOWED_FILES, DROID_PROTECTED_PATHS).ok, true);
  const bad = checkChangedFiles(
    ["apps/storefront/lib/search.ts", "apps/storefront/lib/catalog.ts", "apps/storefront/app/page.tsx"],
    DROID_ALLOWED_FILES,
    DROID_PROTECTED_PATHS,
  );
  assert.deepEqual(bad.problems, [
    "Protected path changed: apps/storefront/lib/catalog.ts",
    "File outside the allowlist changed: apps/storefront/app/page.tsx",
  ]);
  assert.equal(checkChangedFiles([], DROID_ALLOWED_FILES, DROID_PROTECTED_PATHS).ok, false);
});

test("a correct patched page passes", () => {
  const result = checkSearchPage(goodPage, slugs, catalog);
  assert.deepEqual(result.problems, []);
  assert.equal(result.cards, 2);
});

test("the baseline page (name, price, link) passes", () => {
  const baseline = page(
    card("tempo-lite", "Tempo Lite", "<p>$109</p>") + card("cloud-glide", "Cloud Glide", "<p>$95</p>"),
  );
  assert.deepEqual(checkSearchPage(baseline, slugs, catalog).problems, []);
});

test("wrong price, color and stock are caught", () => {
  const bad = page(
    card(
      "tempo-lite",
      "Tempo Lite",
      `<p>$99</p><p>Color: navy</p><ul><li>Size 8: In stock</li><li>Size 7: In stock (2 left)</li><li>Size 11: In stock</li></ul>`,
    ) + card("cloud-glide", "Cloud Glide", `<p>$95</p><ul><li>Size 8: Sold out</li></ul>`),
  );
  assert.deepEqual(checkSearchPage(bad, slugs, catalog).problems, [
    "tempo-lite card: shows $99, catalog price is $109",
    'tempo-lite card: mentions color "navy", catalog color is "black"',
    "tempo-lite card: says size 8 is in stock, catalog stock is 0",
    "tempo-lite card: says 2 of size 7 left, catalog stock is 4",
    'tempo-lite card: size 11 does not exist ("Size 11: In stock")',
    "cloud-glide card: says size 8 is sold out, catalog stock is 5",
  ]);
});

test("dropping or reordering products is caught", () => {
  const reordered = page(
    card("cloud-glide", "Cloud Glide", "<p>$95</p>") + card("tempo-lite", "Tempo Lite", "<p>$109</p>"),
  );
  assert.match(checkSearchPage(reordered, slugs, catalog).problems[0]!, /^Results changed/);
  const dropped = page(card("cloud-glide", "Cloud Glide", "<p>$95</p>"));
  assert.match(checkSearchPage(dropped, slugs, catalog).problems[0]!, /^Results changed/);
});

test("a stock claim covering several sizes in one line is rejected as uncheckable", () => {
  const vague = page(
    card("tempo-lite", "Tempo Lite", "<p>$109</p><p>Size 7, size 8 available</p>") +
      card("cloud-glide", "Cloud Glide", "<p>$95</p>"),
  );
  assert.match(checkSearchPage(vague, slugs, catalog).problems.join("\n"), /several sizes/);
});

test("a single result card stops below the page heading", () => {
  const single = page(card("cloud-glide", "Cloud Glide", "<p>$95</p><p>Color: navy</p>"));
  // The header's links and h1 text must not be read as part of the card.
  assert.deepEqual(checkSearchPage(single, ["cloud-glide"], catalog).problems, []);
});
