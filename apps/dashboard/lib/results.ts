// Reads results the CLI scripts save to data/results/ (gitignored, local only).

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PatchResult } from "@agentfix/shared";

/** A saved optimize() result, as written by packages/optimizer/scripts/run.ts. */
export interface SavedPatch extends PatchResult {
  traceRunId: string;
  createdAt: string;
  file: string;
}

// next dev/build/start run with the dashboard app as the working directory.
const RESULTS_DIR = join(process.cwd(), "../../data/results");

export async function latestPatch(): Promise<SavedPatch | null> {
  const files = await readdir(RESULTS_DIR).catch(() => [] as string[]);
  const latest = files.filter((f) => /^patch-.*\.json$/.test(f)).sort().at(-1);
  if (!latest) return null;
  const saved = JSON.parse(await readFile(join(RESULTS_DIR, latest), "utf8")) as Omit<SavedPatch, "file">;
  return { ...saved, file: `data/results/${latest}` };
}
