import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentTrace, TraceStep } from "@agentfix/shared";
import { sampleTrace } from "@agentfix/shared/fixtures";

import { diagnose } from "./index.ts";

const step = (index: number, action: TraceStep["action"], pagePath: string, ok = true): TraceStep => ({
  index,
  action,
  pagePath,
  startMs: index * 1000,
  browserMs: 100,
  modelMs: 900,
  inputTokens: 1000,
  outputTokens: 50,
  ok,
});

const traceOf = (steps: TraceStep[]): AgentTrace => ({ ...sampleTrace, runId: "test", steps });

test("fixture: three product pages checked and left", async () => {
  const { findings, runId, provenance } = await diagnose(sampleTrace);
  assert.equal(runId, sampleTrace.runId);
  assert.equal(provenance, "fixture");
  assert.equal(findings.length, 1);

  const [f] = findings;
  assert.equal(f!.kind, "excessive_navigation");
  assert.equal(f!.severity, "high");
  // Clicks 3, 6, 9 open tempo-lite, cloud-glide, summit-trail; each visit ends navigating back.
  assert.deepEqual(f!.evidence[0]!.stepIndexes, [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(f!.evidence[0]!.metric!.value, 4);
  assert.equal(f!.evidence[1]!.metric!.value, 9);
  assert.deepEqual(f!.candidateFiles, [
    "apps/storefront/components/search-results.tsx",
    "apps/storefront/lib/search.ts",
  ]);
});

test("direct path to the right product: no findings", async () => {
  const { findings } = await diagnose(
    traceOf([
      step(0, "navigate", "/"),
      step(1, "type", "/"),
      step(2, "click", "/search"),
      step(3, "select", "/products/velocity-runner"),
      step(4, "click", "/products/velocity-runner"),
      step(5, "done", "/cart"),
    ]),
  );
  assert.deepEqual(findings, []);
});

test("revisiting the same product counts as separate visits", async () => {
  const { findings } = await diagnose(
    traceOf([
      step(0, "click", "/search"),
      step(1, "observe", "/products/velocity-runner"),
      step(2, "navigate", "/products/velocity-runner"),
      step(3, "click", "/search"),
      step(4, "click", "/products/velocity-runner"),
      step(5, "done", "/cart"),
    ]),
  );
  assert.equal(findings[0]?.kind, "excessive_navigation");
  assert.equal(findings[0]?.severity, "low");
  assert.deepEqual(findings[0]?.evidence[0]?.stepIndexes, [0, 1, 2]);
});

test("repeated failed actions are flagged", async () => {
  const { findings } = await diagnose(
    traceOf([step(0, "click", "/", false), step(1, "click", "/", false), step(2, "done", "/")]),
  );
  assert.deepEqual(
    findings.map((f) => f.kind),
    ["repeated_failed_actions"],
  );
});
