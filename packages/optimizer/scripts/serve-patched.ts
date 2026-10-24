// Serves the newest accepted patch: finds the latest accepted result in
// data/results/ whose worktree still exists, builds it if needed, and runs
// `next start` in the foreground until Ctrl+C.
//
// Usage (from the repo root):
//   npm run serve:patched                       # http://localhost:3002
//   npm run serve:patched -- --port 3005
//   npm run serve:patched -- --result data/results/patch-<time>.json

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PatchResult } from "@agentfix/shared";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const resultsDir = join(repoPath, "data/results");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const port = Number(arg("--port") ?? 3002);

function pickResult(): { file: string; patch: PatchResult } {
  const chosen = arg("--result");
  const files = chosen
    ? [resolve(repoPath, chosen)]
    : readdirSync(resultsDir, { withFileTypes: true })
        .filter((d) => d.isFile() && /^patch-.*\.json$/.test(d.name))
        .map((d) => join(resultsDir, d.name))
        .sort()
        .reverse();
  for (const file of files) {
    const patch = JSON.parse(readFileSync(file, "utf8")) as PatchResult;
    if (patch.status === "accepted" && patch.provenance === "live" && existsSync(patch.worktreePath)) {
      return { file, patch };
    }
    if (chosen) throw new Error(`${chosen} is not an accepted Droid patch with an existing worktree.`);
  }
  throw new Error(
    "No accepted patch with an existing worktree. Run `npm run optimize --workspace packages/optimizer` first.",
  );
}

const { file, patch } = pickResult();
const storefront = join(patch.worktreePath, "apps/storefront");

if (await fetch(`http://localhost:${port}`).then(() => true, () => false)) {
  console.error(`Port ${port} is already in use. Stop that server first, or pass --port.`);
  process.exit(1);
}

if (!existsSync(join(storefront, ".next/BUILD_ID"))) {
  console.log("No build found in the worktree; building...");
  execFileSync("npm", ["run", "build", "--workspace", "apps/storefront"], { cwd: patch.worktreePath, stdio: "inherit" });
}

console.log(`Serving accepted patch from ${file.replace(`${repoPath}/`, "")}`);
console.log(`  Droid session: ${patch.toolRunId ?? "(none)"}`);
console.log(`  Files changed: ${patch.filesChanged.join(", ")}`);
console.log(`  Worktree:      ${patch.worktreePath}`);
console.log(`  URL:           http://localhost:${port}  (Ctrl+C to stop)\n`);

const server = spawn(join(patch.worktreePath, "node_modules/.bin/next"), ["start", "-p", String(port)], {
  cwd: storefront,
  stdio: "inherit",
});
const stop = () => server.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
