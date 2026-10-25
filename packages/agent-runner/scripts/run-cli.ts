// Runs the shopping agent once through the store's agent interface (`shop`
// commands in a sandboxed shell) and saves the trace for the dashboard.
//
// Usage (from the repo root, with ANTHROPIC_API_KEY in .env and the storefront running):
//   npm run run-cli -w @agentfix/agent-runner                          # on BASELINE_URL
//   ... -- --url http://localhost:3005 --task black-running-shoe-size-8
//
// Each trace is saved to data/results/trace-<runId>.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runTaskCli } from "../cli.ts";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const url = arg("url") ?? process.env.BASELINE_URL ?? "http://localhost:3001";

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

console.log(`Running "${spec.id}" through the agent interface for ${url}...`);
const trace = await runTaskCli({ url, task: spec.task, expectedSku: spec.expectedSku, maxSteps: spec.maxSteps });

for (const s of trace.steps) {
  const detail = s.action === "shell" ? `${s.target ?? ""} (exit ${s.exitCode})` : (s.target ?? "");
  const status = s.ok ? "" : `  FAILED: ${s.error}`;
  console.log(`  #${s.index} ${s.action} ${detail}${status}`);
}
const m = trace.metrics;
console.log(
  `\n${trace.outcome.success ? "VERIFIED" : "FAILED"}: cart ${JSON.stringify(trace.outcome.cart)}` +
    (trace.outcome.reason ? ` (${trace.outcome.reason})` : ""),
);
console.log(
  `${m.toolCalls} tool calls · ${m.inputTokens + m.outputTokens} tokens · ` +
    `$${m.estimatedCostUsd} · ${(m.totalMs / 1000).toFixed(1)}s total ` +
    `(model ${(m.modelMs / 1000).toFixed(1)}s, shell ${(m.browserMs / 1000).toFixed(1)}s)`,
);

const resultsDir = join(repoPath, "data/results");
mkdirSync(resultsDir, { recursive: true });
const file = join(resultsDir, `trace-${trace.runId}.json`);
writeFileSync(file, JSON.stringify(trace, null, 2));
console.log(`Saved ${file}`);
