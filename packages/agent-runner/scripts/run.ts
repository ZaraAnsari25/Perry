// Runs the shopping agent once and saves the trace for the dashboard.
//
// Usage (from the repo root, with ANTHROPIC_API_KEY in .env and the storefront running):
//   npm run run-task -w @agentfix/agent-runner                          # baseline on BASELINE_URL
//   npm run run-task -w @agentfix/agent-runner -- --version patched     # patched on PATCHED_URL
//   ... -- --url http://localhost:3005 --task black-running-shoe-size-8
//   HEADED=1 npm run run-task -w @agentfix/agent-runner                 # watch the browser
//
// Each trace is saved to data/results/trace-<runId>.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SiteVersion } from "@agentfix/shared";

import { runTask } from "../index.ts";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const siteVersion = (arg("version") ?? "baseline") as SiteVersion;
const url =
  arg("url") ??
  (siteVersion === "patched" ? process.env.PATCHED_URL : process.env.BASELINE_URL) ??
  "http://localhost:3001";

interface TaskSpec {
  id: string;
  task: string;
  expectedSku: string;
  maxSteps: number;
}
const { tasks } = JSON.parse(readFileSync(join(repoPath, "data/tasks.json"), "utf8")) as { tasks: TaskSpec[] };
const taskId = arg("task");
const spec = taskId ? tasks.find((t) => t.id === taskId) : tasks[0];
if (!spec) throw new Error(`No task ${taskId} in data/tasks.json`);

console.log(`Running "${spec.id}" on ${url} (${siteVersion})...`);
const trace = await runTask({
  url,
  task: spec.task,
  expectedSku: spec.expectedSku,
  siteVersion,
  maxSteps: spec.maxSteps,
});

for (const s of trace.steps) {
  const status = s.ok ? "" : `  FAILED: ${s.error}`;
  console.log(`  #${s.index} ${s.action} ${s.target ?? ""}  [${s.pagePath}]${status}`);
}
const m = trace.metrics;
console.log(
  `\n${trace.outcome.success ? "VERIFIED" : "FAILED"}: cart ${JSON.stringify(trace.outcome.cart)}` +
    (trace.outcome.reason ? ` (${trace.outcome.reason})` : ""),
);
console.log(
  `${m.toolCalls} tool calls · ${m.inputTokens + m.outputTokens} tokens · ` +
    `$${m.estimatedCostUsd} · ${(m.totalMs / 1000).toFixed(1)}s total ` +
    `(model ${(m.modelMs / 1000).toFixed(1)}s, browser ${(m.browserMs / 1000).toFixed(1)}s)`,
);

const resultsDir = join(repoPath, "data/results");
mkdirSync(resultsDir, { recursive: true });
const file = join(resultsDir, `trace-${trace.runId}.json`);
writeFileSync(file, JSON.stringify(trace, null, 2));
console.log(`Saved ${file}`);
