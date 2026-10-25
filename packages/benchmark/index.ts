// Repeated runs: implements Benchmark and Compare.
//
// Runs are sequential so they don't compete for the browser, the storefront
// or API rate limits, which would distort timings. Every run uses the same
// agent (model, prompt, tools, step limit); only the website differs.

import { runTask } from "@agentfix/agent-runner";
import type {
  AgentTrace,
  Benchmark,
  BenchmarkResult,
  Compare,
  SiteVersion,
  VariantSummary,
} from "@agentfix/shared";

/** Called after each run, so callers can save traces before the benchmark ends. */
export type OnRun = (trace: AgentTrace, runNumber: number, repetitions: number) => void | Promise<void>;

/** Relative change in cost per verified success needed to call a result improved or regressed. */
export const NOISE_MARGIN = 0.05;

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((total, v) => total + v, 0) / values.length;

/** Nearest-rank percentile, p in 0..100. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function summarize(siteVersion: SiteVersion, url: string, runs: AgentTrace[]): VariantSummary {
  const completionRate = runs.length === 0 ? 0 : runs.filter((r) => r.outcome.success).length / runs.length;
  const totalMs = runs.map((r) => r.metrics.totalMs);
  const avgCostUsd = average(runs.map((r) => r.metrics.estimatedCostUsd));
  return {
    siteVersion,
    url,
    runs,
    completionRate,
    medianTotalMs: median(totalMs),
    p95TotalMs: percentile(totalMs, 95),
    avgToolCalls: average(runs.map((r) => r.metrics.toolCalls)),
    avgInputTokens: average(runs.map((r) => r.metrics.inputTokens)),
    avgOutputTokens: average(runs.map((r) => r.metrics.outputTokens)),
    avgCostUsd,
    costPerVerifiedSuccessUsd: completionRate === 0 ? null : avgCostUsd / completionRate,
  };
}

/**
 * Improved only when verified completion does not drop and cost per verified
 * success falls by more than NOISE_MARGIN.
 */
export function verdict(baseline: VariantSummary, patched: VariantSummary): BenchmarkResult["verdict"] {
  if (patched.completionRate < baseline.completionRate) return "regressed";
  const before = baseline.costPerVerifiedSuccessUsd;
  const after = patched.costPerVerifiedSuccessUsd;
  if (after === null) return before === null ? "no_change" : "regressed";
  if (before === null) return "improved";
  if (after < before * (1 - NOISE_MARGIN)) return "improved";
  if (after > before * (1 + NOISE_MARGIN)) return "regressed";
  return "no_change";
}

async function runMany(
  url: string,
  task: string,
  expectedSku: string,
  siteVersion: SiteVersion,
  repetitions: number,
  onRun?: OnRun,
): Promise<AgentTrace[]> {
  const runs: AgentTrace[] = [];
  for (let i = 1; i <= repetitions; i++) {
    const trace = await runTask({ url, task, expectedSku, siteVersion });
    runs.push(trace);
    await onRun?.(trace, i, repetitions);
  }
  return runs;
}

/** Repeated runs against one site version. The summary is returned in `baseline` per the contract. */
export const benchmark = async (
  { url, task, expectedSku, siteVersion, repetitions }: Parameters<Benchmark>[0],
  onRun?: OnRun,
): Promise<BenchmarkResult> => {
  const runs = await runMany(url, task, expectedSku, siteVersion, repetitions, onRun);
  return {
    provenance: "live",
    task,
    expectedSku,
    model: runs[0]?.model ?? "unknown",
    repetitions,
    baseline: summarize(siteVersion, url, runs),
    createdAt: new Date().toISOString(),
  };
};

/**
 * Same task, same agent, both storefronts. Runs alternate baseline, patched,
 * baseline, ... so any drift in API latency over the session affects both
 * versions equally.
 */
export const compare = async (
  { baselineUrl, patchedUrl, task, expectedSku, repetitions }: Parameters<Compare>[0],
  onRun?: OnRun,
): Promise<BenchmarkResult> => {
  const baselineRuns: AgentTrace[] = [];
  const patchedRuns: AgentTrace[] = [];
  for (let i = 1; i <= repetitions; i++) {
    for (const [siteVersion, url, runs] of [
      ["baseline", baselineUrl, baselineRuns],
      ["patched", patchedUrl, patchedRuns],
    ] as const) {
      const trace = await runTask({ url, task, expectedSku, siteVersion });
      runs.push(trace);
      await onRun?.(trace, i, repetitions);
    }
  }
  const baseline = summarize("baseline", baselineUrl, baselineRuns);
  const patched = summarize("patched", patchedUrl, patchedRuns);
  return {
    provenance: "live",
    task,
    expectedSku,
    model: baselineRuns[0]?.model ?? "unknown",
    repetitions,
    baseline,
    patched,
    verdict: verdict(baseline, patched),
    createdAt: new Date().toISOString(),
  };
};

// Type checks that these match the shared contract when no onRun is passed.
const _benchmark: Benchmark = (input) => benchmark(input);
const _compare: Compare = (input) => compare(input);
void _benchmark;
void _compare;
