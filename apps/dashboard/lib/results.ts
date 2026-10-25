// Reads results the CLI scripts save to data/results/ (gitignored, local only).

import { existsSync } from "node:fs";
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
  /** An accepted Droid fix whose built copy still exists, so it can be made live. */
  servable: boolean;
  /** Where the result is kept: current fixes, the demo backup, or archived by a reset. */
  location: PatchLocation;
  /** Before/after measurements of this fix (compare runs), newest first. */
  measurements: Measurement[];
  /** 1 for a first try; 2 or 3 for retries after a fix that wasn't accepted. */
  attempt?: number;
  /** The fix this one retried, if any. */
  retryOf?: string;
}

export type PatchLocation = "current" | "backup" | "archive";

/** A compare() result linked to the fix that was live on localhost:3002 while it ran. */
export interface Measurement {
  file: string;
  result: BenchmarkResult;
  /** "dashboard": measured from this dashboard; "recorded": measured elsewhere and saved here. */
  source: "dashboard" | "recorded";
  note?: string;
}

/**
 * data/results/measurements.json: which fix each compare file measured, keyed
 * by compare file name. Fixes are identified by their Droid session id, which
 * stays the same when a reset moves the fix to the archive.
 */
export type MeasurementIndex = Record<string, { toolRunId: string; source: Measurement["source"]; note?: string }>;

// next dev/build/start run with the dashboard app as the working directory.
const RESULTS_DIR = join(process.cwd(), "../../data/results");
export const MEASUREMENT_INDEX = join(RESULTS_DIR, "measurements.json");

export async function readMeasurementIndex(): Promise<MeasurementIndex> {
  return readFile(MEASUREMENT_INDEX, "utf8").then(
    (text) => JSON.parse(text) as MeasurementIndex,
    () => ({}),
  );
}

/** Measurements grouped by the Droid session id of the fix they measured. */
async function measurementsByFix(): Promise<Map<string, Measurement[]>> {
  const index = await readMeasurementIndex();
  const byFix = new Map<string, Measurement[]>();
  for (const [file, link] of Object.entries(index)) {
    const result = await readFile(join(RESULTS_DIR, file), "utf8").then(
      (text) => JSON.parse(text) as BenchmarkResult,
      () => null,
    );
    if (!result?.patched) continue;
    const list = byFix.get(link.toolRunId) ?? [];
    list.push({ file: `data/results/${file}`, result, source: link.source, note: link.note });
    byFix.set(link.toolRunId, list);
  }
  for (const list of byFix.values()) list.sort((a, b) => b.result.createdAt.localeCompare(a.result.createdAt));
  return byFix;
}

async function readPatches(location: PatchLocation, limit: number): Promise<SavedPatch[]> {
  const dir = location === "current" ? "" : location;
  const measured = await measurementsByFix();
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
      const servable =
        saved.status === "accepted" &&
        saved.provenance === "live" &&
        existsSync(join(saved.worktreePath, "apps/storefront"));
      return {
        blocked: [],
        redTeam: false,
        traceRunId: "",
        createdAt: "",
        ...saved,
        file: `data/results/${path}`,
        servable,
        location,
        measurements: (saved.toolRunId && measured.get(saved.toolRunId)) || [],
      };
    }),
  );
}

/** Saved optimize() results, newest first. Archived results are not included. */
export function recentPatches(limit = 50): Promise<SavedPatch[]> {
  return readPatches("current", limit);
}

/** Every saved fix (current, backup and archived), newest first. */
export async function allPatches(): Promise<SavedPatch[]> {
  const all = (await Promise.all((["current", "backup", "archive"] as const).map((l) => readPatches(l, 500)))).flat();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The newest benchmark() or compare() result, as the source of the agent runs
 * the dashboard lists. Measurements made from the dashboard are excluded: they
 * belong to the fix they measured, not to the list of runs to optimize.
 */
export async function latestBenchmark(): Promise<{ result: BenchmarkResult; file: string } | null> {
  const index = await readMeasurementIndex();
  const files = (await readdir(RESULTS_DIR).catch(() => [] as string[])).filter(
    (f) => /^(benchmark|compare)-.*\.json$/.test(f) && index[f]?.source !== "dashboard",
  );
  const saved = await Promise.all(
    files.map(async (f) => ({
      result: JSON.parse(await readFile(join(RESULTS_DIR, f), "utf8")) as BenchmarkResult,
      file: `data/results/${f}`,
    })),
  );
  return saved.sort((a, b) => b.result.createdAt.localeCompare(a.result.createdAt))[0] ?? null;
}

/** One saved compare() result, for viewing its runs. Only plain file names in data/results/. */
export async function loadCompare(file: string): Promise<BenchmarkResult | null> {
  if (!/^compare-[\w.-]+\.json$/.test(file)) return null;
  return readFile(join(RESULTS_DIR, file), "utf8").then(
    (text) => JSON.parse(text) as BenchmarkResult,
    () => null,
  );
}
