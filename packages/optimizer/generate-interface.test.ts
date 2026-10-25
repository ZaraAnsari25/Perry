// Gate tests with scripted "Droid output" (fixtures, not real Droid runs).

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DROID_PROTECTED_PATHS } from "@agentfix/shared";

import { checkChangedFiles } from "./checks.ts";
import {
  GENERATED_INTERFACE_FILE,
  HANDWRITTEN_FILES,
  INTERFACE_ALLOWED_FILES,
  MAX_SHARED_RUN,
  checkIndependence,
  interfacePrompt,
  runContractGate,
} from "./generate-interface.ts";

const REPO = resolve(fileURLToPath(import.meta.url), "../../..");
const INTERFACE_DIR = join(REPO, "packages/agent-interface");
const handwritten = await Promise.all(
  HANDWRITTEN_FILES.map(async (path) => ({ path, text: await readFile(join(REPO, path), "utf8") })),
);
const coreUrl = pathToFileURL(join(INTERFACE_DIR, "core.ts")).href;

test("fixture: a file outside the allowlist is rejected", () => {
  assert.equal(checkChangedFiles([GENERATED_INTERFACE_FILE], INTERFACE_ALLOWED_FILES, DROID_PROTECTED_PATHS).ok, true);
  for (const files of [
    [GENERATED_INTERFACE_FILE, "apps/storefront/lib/search.ts"],
    ["packages/agent-interface/core.ts"],
    [GENERATED_INTERFACE_FILE, "packages/shared/types.ts"],
    ["apps/storefront/lib/catalog.ts"],
  ])
    assert.equal(checkChangedFiles(files, INTERFACE_ALLOWED_FILES, DROID_PROTECTED_PATHS).ok, false, files.join(", "));
});

test("fixture: importing the hand-written interface is rejected", () => {
  for (const source of [
    'export { runShop } from "../core.ts";\n',
    'import { searchCatalog } from "../search.ts";\nexport const runShop = 1;\n',
    'import { runShop as r } from "@agentfix/agent-interface";\nexport const runShop = r;\n',
    'const m = await import("../core.ts");\nexport const runShop = m.runShop;\n',
    'export * from "../index.ts";\n',
  ]) {
    const r = checkIndependence(source, handwritten);
    assert.equal(r.ok, false, source);
    assert.match(r.detail, /Imports the hand-written interface/);
  }
});

test("fixture: a near-copy of core.ts is rejected; independent code that imports the catalog passes", () => {
  const copied = checkIndependence(handwritten[0]!.text.replaceAll("runShop", "runShop"), handwritten);
  assert.equal(copied.ok, false);
  assert.match(copied.detail, /^Copies \d+ consecutive lines from packages\/agent-interface\/core\.ts/);

  const own = `import { catalog, findVariant } from "../../../apps/storefront/lib/catalog.ts";

export async function runShop(args: string[], ctx: { storeUrl: string; cartId: string }) {
  const first = args[0] ?? "help";
  if (first === "help") return { stdout: "Usage: shop search | shop product | shop cart add\\n", stderr: "", exitCode: 0 };
  const known = findVariant(args[2] ?? "") ?? catalog.length;
  return { stdout: String(known), stderr: ctx.storeUrl, exitCode: 1 };
}
`;
  const r = checkIndependence(own, handwritten);
  assert.equal(r.ok, true, r.detail);
  assert.match(r.detail, new RegExp(`limit ${MAX_SHARED_RUN - 1}`));
});

test("the prompt carries the contract and the rules", () => {
  const p = interfacePrompt("CONTRACT TEXT", "- contract tests: 2 failed");
  for (const s of [
    "apps/storefront/lib/catalog.ts",
    "apps/storefront/app/api/cart/route.ts",
    GENERATED_INTERFACE_FILE,
    "Do not import or copy packages/agent-interface/core.ts or search.ts",
    "CONTRACT TEXT",
    "- contract tests: 2 failed",
  ])
    assert.ok(p.includes(s), s);
});

// The contract gate runs the real contract tests on an implementation file.
const dir = await mkdtemp(join(tmpdir(), "perry-interface-gate-"));
test.after(() => rm(dir, { recursive: true, force: true }));

test("fixture: a correct implementation passes the contract gate", async () => {
  const file = join(dir, "correct.ts");
  await writeFile(file, `export { runShop } from ${JSON.stringify(coreUrl)};\n`);
  const r = await runContractGate(INTERFACE_DIR, file);
  assert.equal(r.ok, true, r.detail);
  assert.match(r.detail, /^All \d+ contract tests pass\.$/);
});

test("fixture: a broken search is rejected by the contract gate", async () => {
  // Drops the last matching row from every search, so results are incomplete.
  const file = join(dir, "broken.ts");
  await writeFile(
    file,
    `import { runShop as real } from ${JSON.stringify(coreUrl)};
export async function runShop(args: string[], ctx: { storeUrl: string; cartId: string }) {
  const r = await real(args, ctx);
  if (args[0] !== "search" || r.exitCode !== 0) return r;
  if (args.includes("--json")) return { ...r, stdout: JSON.stringify(JSON.parse(r.stdout).slice(0, -1)) + "\\n" };
  return r;
}
`,
  );
  const r = await runContractGate(INTERFACE_DIR, file);
  assert.equal(r.ok, false);
  assert.match(r.detail, /contract tests failed: .*soundness and completeness/);
});

test("the contract's field lists don't count as copying", () => {
  const fields = ["sku: string;", "slug: string;", "name: string;", "color: string;", "category: string;", "priceUsd: number;", "size: number;", "stock: number;", "inStock: boolean;"];
  const source = `export interface Row {\n${fields.map((f) => `  ${f}`).join("\n")}\n}\nexport async function runShop() {}\n`;
  assert.equal(checkIndependence(source, handwritten).ok, true);
});
