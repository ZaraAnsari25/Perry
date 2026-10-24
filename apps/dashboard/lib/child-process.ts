// Shared by the API routes that start the optimizer's scripts.

import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// next dev/build/start run with the dashboard app as the working directory.
export const REPO = join(process.cwd(), "../..");
export const RESULTS_DIR = join(REPO, "data/results");
export const OPTIMIZE_LOCK = join(RESULTS_DIR, ".optimize-running");
export const PATCHED_PORT = 3002;

/** Whether an optimize run started from the dashboard is still going. Clears a stale lock. */
export function optimizeRunning(): boolean {
  if (!existsSync(OPTIMIZE_LOCK)) return false;
  try {
    process.kill(Number(readFileSync(OPTIMIZE_LOCK, "utf8")), 0);
    return true;
  } catch {
    rmSync(OPTIMIZE_LOCK, { force: true });
    return false;
  }
}

/**
 * Environment for scripts started from the dashboard. Drops the dashboard's own
 * Next.js settings (NODE_ENV=development under next dev, internal __NEXT_*
 * flags), which would break the storefront's build and start. NODE_ENV stays
 * unset on purpose: NODE_ENV=production would make `npm ci` skip devDependencies.
 */
export function childEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "NODE_ENV" || /^(__NEXT|NEXT_|TURBOPACK)/.test(key)) delete env[key];
  }
  // The Droid SDK starts the droid CLI from PATH.
  env.PATH = `${join(homedir(), ".local/bin")}:${process.env.PATH ?? ""}`;
  return env as NodeJS.ProcessEnv;
}

const run = promisify(execFile);

/** PIDs listening on a local TCP port (macOS/Linux lsof). */
export async function listeners(port: number): Promise<number[]> {
  const out = await run("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]).then((r) => r.stdout, () => "");
  return [...new Set(out.split("\n").filter(Boolean).map(Number))];
}

/** Working directory of a process, e.g. the storefront a server runs from. */
export async function processCwd(pid: number): Promise<string | undefined> {
  const out = await run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]).then((r) => r.stdout, () => "");
  return out.split("\n").find((l) => l.startsWith("n"))?.slice(1);
}

/** The sandbox worktree the fixed store on port 3002 is serving, if any. */
export async function liveWorktree(): Promise<string | undefined> {
  const [pid] = await listeners(PATCHED_PORT);
  const cwd = pid === undefined ? undefined : await processCwd(pid);
  return cwd?.replace(/\/apps\/storefront$/, "");
}
