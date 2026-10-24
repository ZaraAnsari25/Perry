// Apify Actor: a repeatable agent audit of one storefront.
//
// Runs the same shopping agent as the local benchmark against `targetUrl`
// `repetitions` times. Each verified trace goes to the default dataset as it
// finishes; the benchmark summary goes to the key-value store as OUTPUT. The
// Apify run ID is recorded in trace metadata only, never in the agent prompt.

import { Actor } from "apify";

import { benchmark } from "@agentfix/benchmark";
import type { SiteVersion } from "@agentfix/shared";

interface Input {
  targetUrl: string;
  taskText: string;
  expectedSku: string;
  siteVersion?: SiteVersion;
  repetitions?: number;
  runLabel?: string;
}

await Actor.init();

const input = await Actor.getInput<Input>();
if (!input?.targetUrl || !input.taskText || !input.expectedSku) {
  throw new Error("Input needs targetUrl, taskText and expectedSku");
}
const repetitions = Math.min(Math.max(input.repetitions ?? 1, 1), 5);
const siteVersion = input.siteVersion ?? "baseline";
const apifyRunId = Actor.getEnv().actorRunId ?? "local";
const runLabel = input.runLabel ?? "";

console.log(`Auditing ${input.targetUrl} (${siteVersion}), ${repetitions} run(s), Apify run ${apifyRunId}`);

const result = await benchmark(
  {
    url: input.targetUrl,
    task: input.taskText,
    expectedSku: input.expectedSku,
    siteVersion,
    repetitions,
  },
  async (trace, i, n) => {
    trace.meta = { ...trace.meta, apifyRunId, ...(runLabel ? { runLabel } : {}) };
    await Actor.pushData(trace);
    const m = trace.metrics;
    console.log(
      `Run ${i}/${n}: ${trace.outcome.success ? "verified" : "FAILED"} · ${m.toolCalls} tool calls · ` +
        `${m.inputTokens + m.outputTokens} tokens · $${m.estimatedCostUsd} · ${(m.totalMs / 1000).toFixed(1)}s`,
    );
  },
);

await Actor.setValue("OUTPUT", { ...result, apifyRunId, runLabel });

const s = result.baseline;
await Actor.exit(
  `${(s.completionRate * 100).toFixed(0)}% verified · ${s.avgToolCalls.toFixed(1)} tool calls · ` +
    `$${s.costPerVerifiedSuccessUsd?.toFixed(5) ?? "n/a"} per verified success`,
);
