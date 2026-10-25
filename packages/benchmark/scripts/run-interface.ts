// Runs the agent-interface benchmark, or the three-way comparison, and saves the result.
//
// Usage (from the repo root, with ANTHROPIC_API_KEY in .env and the store(s) running):
//   npm run bench:interface -w @agentfix/benchmark -- --reps 2            # agent interface only, on BASELINE_URL
//   npm run bench:interface -w @agentfix/benchmark -- --reps 5 --three    # original vs Droid-fixed vs interface
//
// Every run costs API credits; the estimated cost is printed before starting.
// Each trace is saved to data/results/trace-<runId>.json as it finishes. The
// summary goes to data/results/interface-<time>.json or compare3-<time>.json,
// never benchmark-* or compare-*, which the dashboard reads as browser runs.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BenchmarkResult, VariantSummary } from "@agentfix/shared";

import type { OnRun } from "../index.ts";
import { benchmarkInterface, compareThree } from "../interface.ts";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const resultsDir = join(repoPath, "data/results");
mkdirSync(resultsDir, { recursive: true });

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const repetitions = Number(arg("reps") ?? 3);
const three = process.argv.includes("--three");
const baselineUrl = process.env.BASELINE_URL ?? "http://localhost:3001";
const patchedUrl = process.env.PATCHED_URL ?? "http://localhost:3002";

const { tasks } = JSON.parse(readFileSync(join(repoPath, "data/tasks.json"), "utf8")) as {
  tasks: { id: string; task: string; expectedSku: string }[];
};
const taskId = arg("task");
const spec = taskId ? tasks.find((t) => t.id === taskId) : tasks[0];
if (!spec) throw new Error(`No task ${taskId} in data/tasks.json`);

const totalRuns = repetitions * (three ? 3 : 1);
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

const result: BenchmarkResult = three
  ? await compareThree({ baselineUrl, patchedUrl, task: spec.task, expectedSku: spec.expectedSku, repetitions }, onRun)
  : await benchmarkInterface({ url: baselineUrl, task: spec.task, expectedSku: spec.expectedSku, repetitions }, onRun);

const row = (s: VariantSummary) =>
  `${s.siteVersion.padEnd(16)} success ${(s.completionRate * 100).toFixed(0)}% · ` +
  `median ${(s.medianTotalMs / 1000).toFixed(1)}s · p95 ${(s.p95TotalMs / 1000).toFixed(1)}s · ` +
  `${s.avgToolCalls.toFixed(1)} tool calls · ${Math.round(s.avgInputTokens + s.avgOutputTokens)} tokens · ` +
  `$${s.costPerVerifiedSuccessUsd?.toFixed(5) ?? "n/a"} per verified success`;

console.log(`\n${result.model}, ${repetitions} runs per condition`);
console.log(row(result.baseline));
if (result.patched) console.log(row(result.patched));
if (result.agentInterface) console.log(row(result.agentInterface));
if (result.verdict) console.log(`Verdict, Droid-fixed vs original: ${result.verdict}`);
if (result.agentInterfaceVerdict) console.log(`Verdict, agent interface vs original: ${result.agentInterfaceVerdict}`);

const file = join(resultsDir, `${three ? "compare3" : "interface"}-${result.createdAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(result, null, 2));
console.log(`Saved ${file}`);
