// Unit tests for the statistics and verdict. No agent runs, no API cost.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentTrace } from "@agentfix/shared";
import { sampleTrace } from "@agentfix/shared/fixtures";

import { median, percentile, summarize, verdict } from "./index.ts";

const run = (success: boolean, totalMs: number, costUsd: number, toolCalls = 7): AgentTrace => ({
  ...sampleTrace,
  metrics: { ...sampleTrace.metrics, totalMs, estimatedCostUsd: costUsd, toolCalls },
  outcome: { ...sampleTrace.outcome, success },
});

test("median and nearest-rank p95", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(percentile([1, 2, 3, 4, 5], 95), 5);
  assert.equal(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95), 19);
});

test("cost per verified success divides by completion rate", () => {
  const s = summarize("baseline", "http://x", [run(true, 10, 0.004), run(false, 20, 0.006)]);
  assert.equal(s.completionRate, 0.5);
  assert.equal(s.avgCostUsd, 0.005);
  assert.equal(s.costPerVerifiedSuccessUsd, 0.01);
  assert.equal(s.medianTotalMs, 15);
});

test("no successes means no cost per success", () => {
  const s = summarize("baseline", "http://x", [run(false, 10, 0.004)]);
  assert.equal(s.costPerVerifiedSuccessUsd, null);
});

test("verdict: cheaper with equal completion is improved", () => {
  const before = summarize("baseline", "http://a", [run(true, 10, 0.004)]);
  const after = summarize("patched", "http://b", [run(true, 6, 0.002)]);
  assert.equal(verdict(before, after), "improved");
});

test("verdict: cheaper but less reliable is regressed", () => {
  const before = summarize("baseline", "http://a", [run(true, 10, 0.004), run(true, 10, 0.004)]);
  const after = summarize("patched", "http://b", [run(true, 6, 0.001), run(false, 6, 0.001)]);
  assert.equal(verdict(before, after), "regressed");
});

test("verdict: within the noise margin is no change", () => {
  const before = summarize("baseline", "http://a", [run(true, 10, 0.004)]);
  const after = summarize("patched", "http://b", [run(true, 10, 0.00395)]);
  assert.equal(verdict(before, after), "no_change");
});
