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
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AutonomyLevel,
  DroidMessageType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
  type ToolConfirmationDetails,
} from "@factory/droid-sdk/node";
import { DROID_ALLOWED_FILES, DROID_PROTECTED_PATHS } from "@agentfix/shared";

if (!process.env.FACTORY_API_KEY) {
  throw new Error("FACTORY_API_KEY is not set. Add it to the repo-root .env.");
}

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
const toRepoPath = (p: string) => relative(sandbox, isAbsolute(p) ? p : join(sandbox, p));
const denied: string[] = [];

type Confirmation = ToolConfirmationDetails;

// Files a confirmation would write, or null if it does anything other than
// edit files (shell commands, MCP tools, ...). A Script bundles several calls.
function writtenPaths(details: Confirmation): string[] | null {
  switch (details.type) {
    case ToolConfirmationType.Edit:
    case ToolConfirmationType.Create:
      return [details.filePath];
    case ToolConfirmationType.ApplyPatch:
      return details.files?.flatMap((f) => (f.moveTo ? [f.filePath, f.moveTo] : [f.filePath])) ?? [details.filePath];
    case ToolConfirmationType.Script: {
      const nested = details.calls.map((c) => writtenPaths(c.confirmation as Confirmation));
      return nested.every((p) => p !== null) ? nested.flat() : null;
    }
    default:
      return null;
  }
}

const session = await createSession({
  cwd: sandbox,
  // Off: every edit, file creation and shell command goes through the handler.
  autonomyLevel: AutonomyLevel.Off,
  permissionHandler({ toolUses }) {
    for (const { details } of toolUses) {
      const paths = writtenPaths(details);
      if (paths === null || !paths.every((p) => allowed.has(toRepoPath(p)))) {
        denied.push(paths ? paths.map(toRepoPath).join(", ") : details.type);
        return ToolConfirmationOutcome.Cancel;
      }
    }
    return ToolConfirmationOutcome.ProceedOnce;
  },
});

const prompt = `This is a Next.js storefront. Search-result cards currently show only a product's name and price.
Show each product's color on its search-result card as visible text.
You may edit only these files: ${DROID_ALLOWED_FILES.join(", ")}.
Do not edit any other file, do not change any price or stock value, and do not run shell commands.`;

let sessionId = "";
let result: { success: boolean; subtype: string; text: string; durationMs?: number } | undefined;
try {
  for await (const msg of session.stream(prompt)) {
    switch (msg.type) {
      case DroidMessageType.ToolCall:
        console.log(`[tool] ${msg.name}`);
        break;
      case DroidMessageType.ToolResult:
        console.log(`[tool result] ${msg.isError ? "error" : "ok"}`);
        break;
      case DroidMessageType.Error:
        console.error(`[error] ${msg.message}`);
        break;
      case DroidMessageType.Result:
        sessionId = msg.sessionId;
        result = msg;
        if (msg.tokenUsage) {
          console.log(`[tokens] ${msg.tokenUsage.inputTokens} in, ${msg.tokenUsage.outputTokens} out`);
        }
        break;
    }
  }
} finally {
  await session.close();
}

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
console.log(`droid result: ${result ? `${result.subtype}${result.durationMs ? `, ${result.durationMs}ms` : ""}` : "(no result)"}`);
console.log(`files:        ${touched.join(", ") || "(none)"}`);
console.log(`denied:       ${denied.join("; ") || "(none)"}`);
const pass = result?.success === true && touched.length > 0 && outside.length === 0 && protectedHits.length === 0;
console.log(`allowlist:    ${pass ? "PASS" : `FAIL${outside.length ? ` (outside allowlist: ${outside.join(", ")})` : ""}`}`);
if (result?.text) console.log(`\nDroid says:\n${result.text}`);
process.exitCode = pass ? 0 : 1;
