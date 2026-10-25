// Runs benchmark() or compare() and saves the result for the dashboard.
//
// Usage (from the repo root, with ANTHROPIC_API_KEY in .env and the storefront(s) running):
//   npm run bench -w @agentfix/benchmark -- --reps 2                     # baseline on BASELINE_URL
//   npm run bench -w @agentfix/benchmark -- --reps 2 --version patched   # patched on PATCHED_URL
//   npm run bench -w @agentfix/benchmark -- --reps 5 --compare           # baseline vs patched
//   ... -- --out-prefix friction                                         # save as friction-<time>.json
//
// --out-prefix keeps side experiments (e.g. the STORE_FRICTION store) out of
// benchmark-* / compare-*, which the dashboard reads as its browser runs.
//
// Every run costs API credits; the estimated cost is printed before starting.
// Each trace is saved to data/results/trace-<runId>.json as it finishes, and
// the summary to data/results/benchmark-<time>.json or compare-<time>.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SiteVersion, VariantSummary } from "@agentfix/shared";

import { benchmark, compare, type OnRun } from "../index.ts";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const resultsDir = join(repoPath, "data/results");
mkdirSync(resultsDir, { recursive: true });

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const repetitions = Number(arg("reps") ?? 3);
const isCompare = process.argv.includes("--compare");
const siteVersion = (arg("version") ?? "baseline") as SiteVersion;
const baselineUrl = process.env.BASELINE_URL ?? "http://localhost:3001";
const patchedUrl = process.env.PATCHED_URL ?? "http://localhost:3002";

const { tasks } = JSON.parse(readFileSync(join(repoPath, "data/tasks.json"), "utf8")) as {
  tasks: { id: string; task: string; expectedSku: string }[];
};
const spec = tasks[0]!;

const totalRuns = repetitions * (isCompare ? 2 : 1);
console.log(
  `${totalRuns} agent runs (~$${(totalRuns * 0.005).toFixed(2)} at about half a cent per run with Claude Haiku 5.5)`,
);

const onRun: OnRun = (trace, i, n) => {
  writeFileSync(join(resultsDir, `trace-${trace.runId}.json`), JSON.stringify(trace, null, 2));
  const m = trace.metrics;
  console.log(
    `  ${trace.siteVersion} ${i}/${n}: ${trace.outcome.success ? "verified" : "FAILED"} · ` +
      `${m.toolCalls} tool calls · ${m.inputTokens + m.outputTokens} tokens · $${m.estimatedCostUsd} · ` +
      `${(m.totalMs / 1000).toFixed(1)}s`,
  );
};

const result = isCompare
  ? await compare({ baselineUrl, patchedUrl, task: spec.task, expectedSku: spec.expectedSku, repetitions }, onRun)
  : await benchmark(
      {
        url: siteVersion === "patched" ? patchedUrl : baselineUrl,
        task: spec.task,
        expectedSku: spec.expectedSku,
        siteVersion,
        repetitions,
      },
      onRun,
    );

const row = (s: VariantSummary) =>
  `${s.siteVersion.padEnd(9)} success ${(s.completionRate * 100).toFixed(0)}% · ` +
  `median ${(s.medianTotalMs / 1000).toFixed(1)}s · p95 ${(s.p95TotalMs / 1000).toFixed(1)}s · ` +
  `${s.avgToolCalls.toFixed(1)} tool calls · ${Math.round(s.avgInputTokens + s.avgOutputTokens)} tokens · ` +
  `$${s.costPerVerifiedSuccessUsd?.toFixed(5) ?? "n/a"} per verified success`;

console.log(`\n${result.model}, ${repetitions} runs per site`);
console.log(row(result.baseline));
if (result.patched) console.log(row(result.patched));
if (result.verdict) console.log(`Verdict: ${result.verdict}`);

const prefix = arg("out-prefix") ?? (isCompare ? "compare" : "benchmark");
if (!/^[a-z0-9-]+$/.test(prefix)) throw new Error(`--out-prefix must be lowercase letters, digits or dashes, got "${prefix}"`);
const file = join(resultsDir, `${prefix}-${result.createdAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(result, null, 2));
console.log(`Saved ${file}`);
