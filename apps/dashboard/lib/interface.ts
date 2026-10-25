// Reads the agent-interface results Zara's benchmark saves to data/results/
// (compare3-*.json, interface-*.json) and the guide `npm run interface:export`
// writes (agent-guide.json). Every reader returns null on missing or bad files.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BenchmarkResult, Provenance } from "@agentfix/shared";
import { READ_ONLY } from "@/lib/mode";

// The online copy reads a recorded snapshot (demo-data/) instead.
const RESULTS_DIR = join(process.cwd(), READ_ONLY ? "demo-data" : "../../data/results");

/** When `npm run reset:demo` last started a demo session, or null if it never has. */
export async function demoStart(): Promise<string | null> {
  const text = await readFile(join(RESULTS_DIR, ".demo-start"), "utf8").catch(() => "");
  return text.trim() || null;
}

/**
 * Which saved results to consider, by createdAt: `since` for this demo session,
 * `before` for the last recorded one before it (shown as a backup).
 */
export interface Window {
  since?: string | null;
  before?: string | null;
}

const inWindow = (createdAt: string, w: Window = {}) =>
  (!w.since || createdAt >= w.since) && (!w.before || createdAt < w.before);

async function newest(
  pattern: RegExp,
  usable: (r: BenchmarkResult) => boolean,
  w?: Window,
): Promise<{ result: BenchmarkResult; file: string } | null> {
  const files = (await readdir(RESULTS_DIR).catch(() => [] as string[])).filter((f) => pattern.test(f));
  const saved = await Promise.all(
    files.map(async (f) => {
      try {
        const result = JSON.parse(await readFile(join(RESULTS_DIR, f), "utf8")) as BenchmarkResult;
        return usable(result) && inWindow(String(result.createdAt), w) ? { result, file: `data/results/${f}` } : null;
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
export function latestThreeWay(w?: Window) {
  return newest(/^compare3-.*\.json$/, (r) => !!r.baseline?.runs && !!r.patched?.runs && !!r.agentInterface?.runs, w);
}

/** The newest benchmarkInterface() result (its `baseline` is the interface runs). */
export function latestInterfaceResult(w?: Window) {
  return newest(/^interface-(?!gen-).*\.json$/, (r) => !!r.baseline?.runs, w);
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
export async function latestInterfaceGen(w?: Window): Promise<InterfaceGen | null> {
  const files = (await readdir(RESULTS_DIR).catch(() => [] as string[])).filter((f) => /^interface-gen-.*\.json$/.test(f));
  const saved = await Promise.all(
    files.map(async (f) => {
      try {
        const gen = JSON.parse(await readFile(join(RESULTS_DIR, f), "utf8")) as Omit<InterfaceGen, "file">;
        return Array.isArray(gen.gates) && typeof gen.createdAt === "string" && inWindow(gen.createdAt, w)
          ? { ...gen, file: `data/results/${f}` }
          : null;
      } catch {
        return null;
      }
    }),
  );
  return saved.filter((s) => s !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** A purchase by an outside agent through perry-shop, saved by `verify-cart --save`. */
export interface OutsideAgentCheck {
  provenance: Provenance;
  client: string;
  cartId: string;
  storeUrl: string;
  expectedSku: string;
  success: boolean;
  reason?: string;
  cart: { sku: string; quantity: number }[];
  implementation?: string;
  createdAt: string;
  file: string;
}

/** The newest outside-agent purchase check, or null. */
export async function latestOutsideAgent(w?: Window): Promise<OutsideAgentCheck | null> {
  const files = (await readdir(RESULTS_DIR).catch(() => [] as string[])).filter((f) => /^outside-agent-.*\.json$/.test(f));
  const saved = await Promise.all(
    files.map(async (f) => {
      try {
        const check = JSON.parse(await readFile(join(RESULTS_DIR, f), "utf8")) as Omit<OutsideAgentCheck, "file">;
        return typeof check.createdAt === "string" && Array.isArray(check.cart) && inWindow(check.createdAt, w)
          ? { ...check, file: `data/results/${f}` }
          : null;
      } catch {
        return null;
      }
    }),
  );
  return saved.filter((s) => s !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
