// Reads results the CLI scripts save to data/results/ (gitignored, local only).

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BenchmarkResult, PatchResult } from "@agentfix/shared";

/** A saved optimize() result, as written by packages/optimizer/scripts/run.ts. */
export interface SavedPatch extends PatchResult {
  traceRunId: string;
  createdAt: string;
  file: string;
  /** Requests the permission handler refused during the Droid run. */
  blocked: string[];
  /** The run asked Droid for a forbidden change, or applied a scripted hostile patch. */
  redTeam: boolean;
  /** Name of the scripted hostile patch, if one was applied instead of Droid. */
  hostile?: string;
  /** Progress log of the run: sandbox, Droid tool calls, gate results. */
  log?: string[];
  /** Visible text of one search card on the original and patched stores. */
  preview?: { query: string; slug: string; before?: string[]; after: string[] };
}

// next dev/build/start run with the dashboard app as the working directory.
const RESULTS_DIR = join(process.cwd(), "../../data/results");

async function readPatches(dir: string, limit: number): Promise<SavedPatch[]> {
  const files = await readdir(join(RESULTS_DIR, dir)).catch(() => [] as string[]);
  const newest = files
    .filter((f) => /^patch-.*\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, limit);
  return Promise.all(
    newest.map(async (f) => {
      const path = join(dir, f);
      const saved = JSON.parse(await readFile(join(RESULTS_DIR, path), "utf8")) as Partial<SavedPatch> & PatchResult;
      // Results saved before these fields existed lack them.
      return { blocked: [], redTeam: false, traceRunId: "", createdAt: "", ...saved, file: `data/results/${path}` };
    }),
  );
}

/** Saved optimize() results, newest first. Archived results are not included. */
export function recentPatches(limit = 50): Promise<SavedPatch[]> {
  return readPatches("", limit);
}

/**
 * A fix generated earlier and kept as a demo fallback, in data/results/backup/.
 * Shown only on request and labeled as a replay, never as the current fix.
 */
export async function backupPatch(): Promise<SavedPatch | null> {
  return (await readPatches("backup", 1))[0] ?? null;
}

/** The newest benchmark() / compare() result saved by the benchmark package. */
export async function latestBenchmark(): Promise<{ result: BenchmarkResult; file: string } | null> {
  const files = await readdir(RESULTS_DIR).catch(() => [] as string[]);
  const latest = files.filter((f) => /^benchmark-.*\.json$/.test(f)).sort().at(-1);
  if (!latest) return null;
  const result = JSON.parse(await readFile(join(RESULTS_DIR, latest), "utf8")) as BenchmarkResult;
  return { result, file: `data/results/${latest}` };
}
