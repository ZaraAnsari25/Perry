// Reads results the CLI scripts save to data/results/ (gitignored, local only).

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PatchResult } from "@agentfix/shared";

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
}

// next dev/build/start run with the dashboard app as the working directory.
const RESULTS_DIR = join(process.cwd(), "../../data/results");

/** Saved optimize() results, newest first. */
export async function recentPatches(limit = 10): Promise<SavedPatch[]> {
  const files = await readdir(RESULTS_DIR).catch(() => [] as string[]);
  const newest = files
    .filter((f) => /^patch-.*\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, limit);
  return Promise.all(
    newest.map(async (f) => {
      const saved = JSON.parse(await readFile(join(RESULTS_DIR, f), "utf8")) as Partial<SavedPatch> & PatchResult;
      // Results saved before these fields existed lack them.
      return { blocked: [], redTeam: false, traceRunId: "", createdAt: "", ...saved, file: `data/results/${f}` };
    }),
  );
}
