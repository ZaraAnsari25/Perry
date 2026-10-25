// Agent-interface benchmarks: the interface alone, and the three-way
// comparison (original website, Droid-fixed website, agent interface).
//
// The same agent settings, task, step limit and cart verifier are used in all
// three conditions. Conditions 1 and 2 browse a website; condition 3 uses the
// store's `shop` commands and buys from the original store's cart.
// compare() in index.ts is unchanged.

import { runTask } from "@agentfix/agent-runner";
import { runTaskCli } from "@agentfix/agent-runner/cli";
import type { AgentTrace, BenchmarkResult } from "@agentfix/shared";

import { summarize, verdict, type OnRun } from "./index.ts";

export interface InterfaceBenchmarkInput {
  /** Storefront the `shop` command talks to, e.g. http://localhost:3001 */
  url: string;
  task: string;
  expectedSku: string;
  repetitions: number;
}

export interface CompareThreeInput {
  /** Original store, e.g. http://localhost:3001 */
  baselineUrl: string;
  /** Droid-fixed store, e.g. http://localhost:3002 */
  patchedUrl: string;
  /** Store the `shop` command talks to; defaults to baselineUrl. */
  interfaceUrl?: string;
  task: string;
  expectedSku: string;
  repetitions: number;
}

/** Swappable runners and fetch, so the rotation can be tested without the API or a browser. */
export interface InterfaceBenchmarkDeps {
  runTask?: typeof runTask;
  runTaskCli?: typeof runTaskCli;
  fetch?: typeof fetch;
}

/** Repeated agent-interface runs. The summary goes in `baseline`, as for benchmark(). */
export const benchmarkInterface = async (
  { url, task, expectedSku, repetitions }: InterfaceBenchmarkInput,
  onRun?: OnRun,
  deps: InterfaceBenchmarkDeps = {},
): Promise<BenchmarkResult> => {
  const runCli = deps.runTaskCli ?? runTaskCli;
  const runs: AgentTrace[] = [];
  for (let i = 1; i <= repetitions; i++) {
    const trace = await runCli({ url, task, expectedSku });
    runs.push(trace);
    await onRun?.(trace, i, repetitions);
  }
  return {
    provenance: "live",
    task,
    expectedSku,
    model: runs[0]?.model ?? "unknown",
    repetitions,
    baseline: summarize("agent-interface", url, runs),
    createdAt: new Date().toISOString(),
  };
};

/** Fails fast, before any paid run, when a store isn't serving. */
async function assertServing(label: string, url: string, hint: string, doFetch: typeof fetch) {
  const problem = await doFetch(url)
    .then((res) => (res.ok ? undefined : `HTTP ${res.status}`))
    .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
  if (problem) throw new Error(`${label} at ${url} is not responding (${problem}). ${hint}`);
}

/**
 * Same task, same agent, three conditions. Each repetition runs baseline,
 * then patched, then agent interface, so drift in API latency over the
 * session affects all three equally.
 */
export const compareThree = async (
  { baselineUrl, patchedUrl, interfaceUrl = baselineUrl, task, expectedSku, repetitions }: CompareThreeInput,
  onRun?: OnRun,
  deps: InterfaceBenchmarkDeps = {},
): Promise<BenchmarkResult> => {
  const runBrowser = deps.runTask ?? runTask;
  const runCli = deps.runTaskCli ?? runTaskCli;
  const doFetch = deps.fetch ?? fetch;

  await assertServing("The original store", baselineUrl, "Start it with `npm run start:store`.", doFetch);
  await assertServing("The Droid-fixed store", patchedUrl, "Make a fix live with `npm run serve:patched`.", doFetch);
  if (interfaceUrl !== baselineUrl) {
    await assertServing("The agent interface's store", interfaceUrl, "Start the store the `shop` command should use.", doFetch);
  }

  const baselineRuns: AgentTrace[] = [];
  const patchedRuns: AgentTrace[] = [];
  const interfaceRuns: AgentTrace[] = [];
  for (let i = 1; i <= repetitions; i++) {
    const conditions = [
      { runs: baselineRuns, run: () => runBrowser({ url: baselineUrl, task, expectedSku, siteVersion: "baseline" }) },
      { runs: patchedRuns, run: () => runBrowser({ url: patchedUrl, task, expectedSku, siteVersion: "patched" }) },
      { runs: interfaceRuns, run: () => runCli({ url: interfaceUrl, task, expectedSku }) },
    ];
    for (const { runs, run } of conditions) {
      const trace = await run();
      runs.push(trace);
      await onRun?.(trace, i, repetitions);
    }
  }

  const baseline = summarize("baseline", baselineUrl, baselineRuns);
  const patched = summarize("patched", patchedUrl, patchedRuns);
  const agentInterface = summarize("agent-interface", interfaceUrl, interfaceRuns);
  return {
    provenance: "live",
    task,
    expectedSku,
    model: baselineRuns[0]?.model ?? "unknown",
    repetitions,
    baseline,
    patched,
    verdict: verdict(baseline, patched),
    agentInterface,
    agentInterfaceVerdict: verdict(baseline, agentInterface),
    createdAt: new Date().toISOString(),
  };
};
