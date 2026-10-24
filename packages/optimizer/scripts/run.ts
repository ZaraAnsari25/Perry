// Runs optimize() end to end on the sample trace.
//
// Usage (from the repo root, with FACTORY_API_KEY in .env and droid on PATH):
//   npm run optimize --workspace packages/optimizer            # check, then stop the server
//   npm run optimize --workspace packages/optimizer -- --serve # keep serving an accepted patch

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DROID_ALLOWED_FILES } from "@agentfix/shared";
import { sampleTrace } from "@agentfix/shared/fixtures";

import { optimize } from "../index.ts";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const serve = process.argv.includes("--serve");

const result = await optimize(
  { trace: sampleTrace, repoPath, allowedFiles: [...DROID_ALLOWED_FILES] },
  { keepServer: serve, log: (line) => console.log(line) },
);

console.log("\n--- diff ---");
console.log(result.diff || "(no changes)");
console.log("--- result ---");
console.log(`status:     ${result.status}`);
console.log(`checks:     allowlist ${result.checks.allowlist}, build ${result.checks.build}, tests ${result.checks.tests}`);
console.log(`files:      ${result.filesChanged.join(", ") || "(none)"}`);
console.log(`base:       ${result.baseCommit}`);
console.log(`worktree:   ${result.worktreePath}`);
console.log(`droid run:  ${result.toolRunId ?? "(none)"}`);
if (result.patchedUrl) console.log(`patched:    ${result.patchedUrl}  (Ctrl+C to stop)`);
if (result.rejectionReason) console.log(`\nreason:\n${result.rejectionReason}`);
if (result.explanation) console.log(`\nDroid says:\n${result.explanation}`);
process.exitCode = result.status === "accepted" ? 0 : 1;
