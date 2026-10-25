// Shared by the API routes that start the optimizer's scripts.

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { ONLINE_FIX_FILE, READ_ONLY } from "@/lib/mode";

// next dev/build/start run with the dashboard app as the working directory.
export const REPO = join(process.cwd(), "../..");
/** The online copy reads a recorded snapshot (demo-data/) instead. */
export const RESULTS_DIR = READ_ONLY ? join(process.cwd(), "demo-data") : join(REPO, "data/results");
export const OPTIMIZE_LOCK = join(RESULTS_DIR, ".optimize-running");
export const MEASURE_LOCK = join(RESULTS_DIR, ".measure-running");
/** Droid generating the shop commands (Feature 2). */
export const GENERATE_LOCK = join(RESULTS_DIR, ".generate-running");
/** Agent runs on the shop commands, or the three-way comparison. */
export const AGENTS_LOCK = join(RESULTS_DIR, ".agents-running");
export const BASELINE_PORT = 3001;
export const PATCHED_PORT = 3002;

/** Whether the process recorded in a lock file is still running. Clears a stale lock. */
function lockHeld(lock: string): boolean {
  if (!existsSync(lock)) return false;
  try {
    process.kill(Number(readFileSync(lock, "utf8")), 0);
    return true;
  } catch {
    rmSync(lock, { force: true });
    return false;
  }
}

/** Whether an optimize run started from the dashboard is still going. */
export const optimizeRunning = () => lockHeld(OPTIMIZE_LOCK);

/** Whether a measurement (compare runs on 3001 and 3002) is still going. */
export const measureRunning = () => lockHeld(MEASURE_LOCK);

/**
 * What's running from the dashboard, if anything: only one job at a time.
 * `allowGenerate` lets a job run alongside Droid generating the shop commands,
 * which works in its own copy and only touches the original store's cart.
 */
export function busyWith({ allowGenerate = false } = {}): string | null {
  if (lockHeld(OPTIMIZE_LOCK)) return "an optimize run";
  if (lockHeld(MEASURE_LOCK)) return "a measurement";
  if (!allowGenerate && lockHeld(GENERATE_LOCK)) return "Droid generating the shop commands";
  if (lockHeld(AGENTS_LOCK)) return "agent runs";
  return null;
}

/**
 * Runs scripts one after another (each only if the previous one succeeded) and
 * streams their combined output, ending with "[exit <code>]". The lock file holds
 * the running child's PID. If the page goes away, the scripts keep going.
 */
export function streamScripts(steps: { cwd: string; args: string[] }[], lock: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The page went away; the scripts keep going and still save their results.
        }
      };
      const next = (i: number) => {
        const step = steps[i];
        if (!step) return finish(0);
        const child = spawn(process.execPath, step.args, { cwd: step.cwd, env: childEnv() });
        writeFileSync(lock, String(child.pid));
        child.stdout.on("data", (chunk: Buffer) => send(chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => send(chunk.toString()));
        child.on("close", (code) => (code === 0 ? next(i + 1) : finish(code ?? 1)));
      };
      const finish = (code: number) => {
        rmSync(lock, { force: true });
        send(`\n[exit ${code}]\n`);
        try {
          controller.close();
        } catch {}
      };
      next(0);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export const reachable = (port: number) =>
  fetch(`http://localhost:${port}`).then(
    () => true,
    () => false,
  );

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
  // Online, the fix that's live is the one the online fixed store is built from.
  if (READ_ONLY)
    return readFile(join(RESULTS_DIR, ONLINE_FIX_FILE), "utf8").then(
      (t) => (JSON.parse(t) as { worktreePath?: string }).worktreePath,
      () => undefined,
    );
  const [pid] = await listeners(PATCHED_PORT);
  const cwd = pid === undefined ? undefined : await processCwd(pid);
  return cwd?.replace(/\/apps\/storefront$/, "");
}
