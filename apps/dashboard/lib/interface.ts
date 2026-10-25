// Reads the agent-interface results Zara's benchmark saves to data/results/
// (compare3-*.json, interface-*.json) and the guide `npm run interface:export`
// writes (agent-guide.json). Every reader returns null on missing or bad files.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BenchmarkResult, Provenance } from "@agentfix/shared";

const RESULTS_DIR = join(process.cwd(), "../../data/results");

async function newest(
  pattern: RegExp,
  usable: (r: BenchmarkResult) => boolean,
): Promise<{ result: BenchmarkResult; file: string } | null> {
  const files = (await readdir(RESULTS_DIR).catch(() => [] as string[])).filter((f) => pattern.test(f));
  const saved = await Promise.all(
    files.map(async (f) => {
      try {
        const result = JSON.parse(await readFile(join(RESULTS_DIR, f), "utf8")) as BenchmarkResult;
        return usable(result) ? { result, file: `data/results/${f}` } : null;
      } catch {
        return null;
      }
    }),
  );
  return (
    saved
      .filter((s) => s !== null)
      .sort((a, b) => String(b.result.createdAt).localeCompare(String(a.result.createdAt)))[0] ?? null
  );
}

/** The newest compareThree() result: original site, Droid-fixed site and agent interface. */
export function latestThreeWay() {
  return newest(/^compare3-.*\.json$/, (r) => !!r.baseline?.runs && !!r.patched?.runs && !!r.agentInterface?.runs);
}

/** The newest benchmarkInterface() result (its `baseline` is the interface). Transcript fallback only. */
export function latestInterfaceResult() {
  return newest(/^interface-.*\.json$/, (r) => !!r.baseline?.runs);
}

export interface AgentGuide {
  provenance: Provenance;
  generatedAt: string;
  guide: string;
}

/** The guide the agent sees in its first message. */
export async function agentGuide(): Promise<AgentGuide | null> {
  try {
    const saved = JSON.parse(await readFile(join(RESULTS_DIR, "agent-guide.json"), "utf8")) as AgentGuide;
    return typeof saved.guide === "string" ? saved : null;
  } catch {
    return null;
  }
}

/** A saved generate:interface run (packages/optimizer/scripts/generate-interface.ts). */
export interface InterfaceGen {
  provenance: Provenance;
  status: "accepted" | "rejected" | "failed";
  gates: { name: string; ok: boolean; detail: string; skipped?: boolean }[];
  droidSessionId?: string;
  createdAt: string;
  reason?: string;
  sourceFile?: string;
  retryOf?: string;
  file: string;
}

/** The newest interface generation run, or null. */
export async function latestInterfaceGen(): Promise<InterfaceGen | null> {
  const files = (await readdir(RESULTS_DIR).catch(() => [] as string[])).filter((f) => /^interface-gen-.*\.json$/.test(f));
  const saved = await Promise.all(
    files.map(async (f) => {
      try {
        const gen = JSON.parse(await readFile(join(RESULTS_DIR, f), "utf8")) as Omit<InterfaceGen, "file">;
        return Array.isArray(gen.gates) && typeof gen.createdAt === "string" ? { ...gen, file: `data/results/${f}` } : null;
      } catch {
        return null;
      }
    }),
  );
  return saved.filter((s) => s !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
