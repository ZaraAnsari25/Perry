// Factory Droid SDK proof of concept.
//
// Copies the storefront's search files into a throwaway git repo, asks Droid
// for one small edit through @factory/droid-sdk, and checks the resulting diff
// against DROID_ALLOWED_FILES. Never touches a developer checkout.
//
// Usage (from the repo root, with FACTORY_API_KEY in .env):
//   npm run poc --workspace packages/factory

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DROID_ALLOWED_FILES, DROID_PROTECTED_PATHS } from "@agentfix/shared";

import { runDroid } from "../index.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// realpath: on macOS the temp dir is a symlink, and Droid reports resolved paths.
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "agentfix-droid-poc-")));
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: sandbox, encoding: "utf8" });

// The two editable files plus the protected catalog they import.
const seedFiles = [...DROID_ALLOWED_FILES, "apps/storefront/lib/catalog.ts"];
for (const file of seedFiles) {
  mkdirSync(dirname(join(sandbox, file)), { recursive: true });
  cpSync(join(repoRoot, file), join(sandbox, file));
}
git("init", "-q");
git("add", ".");
git("-c", "user.name=AgentFix", "-c", "user.email=agentfix@localhost", "commit", "-q", "-m", "baseline");
const baseCommit = git("rev-parse", "HEAD").trim();

const allowed = new Set<string>(DROID_ALLOWED_FILES);

const prompt = `This is a Next.js storefront. Search-result cards currently show only a product's name and price.
Show each product's color on its search-result card as visible text.
You may edit only these files: ${DROID_ALLOWED_FILES.join(", ")}.
Do not edit any other file, do not change any price or stock value, and do not run shell commands.`;

const result = await runDroid({
  cwd: sandbox,
  prompt,
  allowedFiles: DROID_ALLOWED_FILES,
  onEvent: (line) => console.log(line),
});
if (result.tokenUsage) {
  console.log(`[tokens] ${result.tokenUsage.inputTokens} in, ${result.tokenUsage.outputTokens} out`);
}
const { sessionId, denied } = result;

const changed = git("diff", "--name-only", baseCommit).split("\n").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
const touched = [...changed, ...untracked];
const outside = touched.filter((f) => !allowed.has(f));
const protectedHits = touched.filter((f) => DROID_PROTECTED_PATHS.some((p) => f.startsWith(p)));

console.log("\n--- diff ---");
console.log(git("diff", baseCommit) || "(no changes)");
console.log("--- summary ---");
console.log(`sandbox:      ${sandbox}`);
console.log(`base commit:  ${baseCommit}`);
console.log(`session id:   ${sessionId || "(none)"}`);
console.log(`droid result: ${result.subtype}${result.durationMs ? `, ${result.durationMs}ms` : ""}`);
console.log(`files:        ${touched.join(", ") || "(none)"}`);
console.log(`denied:       ${denied.join("; ") || "(none)"}`);
const pass = result.success && touched.length > 0 && outside.length === 0 && protectedHits.length === 0;
console.log(`allowlist:    ${pass ? "PASS" : `FAIL${outside.length ? ` (outside allowlist: ${outside.join(", ")})` : ""}`}`);
if (result.text) console.log(`\nDroid says:\n${result.text}`);
process.exitCode = pass ? 0 : 1;
