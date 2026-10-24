// Puts the demo back to "nothing optimized yet": archives current fix results,
// stops the fixed store on localhost:3002, and removes the sandbox copies of the
// archived fixes. Keeps the backup fix (data/results/backup/), the benchmark
// data, the original store and the dashboard.
//
// Usage (from the repo root):
//   npm run reset:demo

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const resultsDir = join(repoPath, "data/results");
const sh = (cmd: string, args: string[]) => {
  try {
    return execFileSync(cmd, args, { cwd: repoPath, encoding: "utf8" });
  } catch {
    return "";
  }
};

// 1. Never cut off an optimize run started from the dashboard.
const lock = join(resultsDir, ".optimize-running");
if (existsSync(lock)) {
  try {
    process.kill(Number(readFileSync(lock, "utf8")), 0);
    console.error("An optimize run is in progress. Wait for it to finish, then reset.");
    process.exit(1);
  } catch {
    rmSync(lock, { force: true });
  }
}

// 2. Archive current fix results.
const archive = join(resultsDir, "archive");
mkdirSync(archive, { recursive: true });
const current = existsSync(resultsDir) ? readdirSync(resultsDir).filter((f) => /^patch-.*\.json$/.test(f)) : [];
for (const f of current) renameSync(join(resultsDir, f), join(archive, f));
console.log(`Archived ${current.length} fix result(s) to data/results/archive/.`);

// 3. Stop the fixed store on 3002 (its serve-patched wrapper exits with it).
const pids = sh("lsof", ["-nP", "-t", "-iTCP:3002", "-sTCP:LISTEN"]).split("\n").filter(Boolean);
for (const pid of new Set(pids)) process.kill(Number(pid), "SIGTERM");
console.log(pids.length > 0 ? "Stopped the fixed store on localhost:3002." : "No fixed store was running on localhost:3002.");

// 4. Remove sandbox copies, except the backup fix's.
const backupDir = join(resultsDir, "backup");
const keep = new Set(
  (existsSync(backupDir) ? readdirSync(backupDir) : [])
    .filter((f) => /^patch-.*\.json$/.test(f))
    .map((f) => (JSON.parse(readFileSync(join(backupDir, f), "utf8")) as { worktreePath: string }).worktreePath),
);
const worktrees = sh("git", ["worktree", "list", "--porcelain"])
  .split("\n")
  .filter((l) => l.startsWith("worktree ") && l.includes("-droid-sandbox/"))
  .map((l) => l.slice("worktree ".length));
let removed = 0;
for (const w of worktrees) {
  if (keep.has(w)) continue;
  sh("git", ["worktree", "remove", "--force", w]);
  removed++;
}
sh("git", ["worktree", "prune"]);
console.log(`Removed ${removed} sandbox cop${removed === 1 ? "y" : "ies"}; kept ${keep.size} (the backup fix).`);
console.log("\nReset done. Refresh the dashboard: every run now shows \"No fix yet\".");
