// Hand-written sample trace for building the dashboard and diagnosis before
// real runTask() output exists. Values are illustrative, not measurements.
// Product IDs and SKUs are placeholders; the real catalog is owned by Person A.
//
// Story: the baseline search results show only name + price, so the agent
// opens four product pages to check color, category and size-8 stock before
// finding the one qualifying shoe.

import type { AgentTrace, TraceStep } from "../types";

const step = (
  index: number,
  action: TraceStep["action"],
  pagePath: string,
  startMs: number,
  browserMs: number,
  modelMs: number,
  inputTokens: number,
  outputTokens: number,
  target?: string,
): TraceStep => ({
  index,
  action,
  target,
  pagePath,
  startMs,
  browserMs,
  modelMs,
  inputTokens,
  outputTokens,
  ok: true,
});

const steps: TraceStep[] = [
  step(0, "navigate", "/", 0, 1200, 900, 820, 40, "/"),
  step(1, "type", "/", 2100, 300, 1100, 1350, 55, "search box: black running shoe"),
  step(2, "observe", "/search", 3500, 900, 1400, 1900, 70, "search results"),
  step(3, "click", "/search", 5800, 700, 1300, 1150, 45, "Tempo Lite"),
  step(4, "observe", "/products/tempo-lite", 7800, 400, 1500, 1700, 60, "size options"),
  step(5, "navigate", "/products/tempo-lite", 9700, 800, 1200, 1100, 40, "/search?q=black+running+shoe"),
  step(6, "click", "/search", 11700, 700, 1300, 1150, 45, "Cloud Glide"),
  step(7, "observe", "/products/cloud-glide", 13700, 400, 1400, 1650, 55, "color"),
  step(8, "navigate", "/products/cloud-glide", 15500, 800, 1100, 1100, 40, "/search?q=black+running+shoe"),
  step(9, "click", "/search", 17400, 700, 1300, 1150, 45, "Summit Trail"),
  step(10, "observe", "/products/summit-trail", 19400, 400, 1400, 1650, 55, "category"),
  step(11, "navigate", "/products/summit-trail", 21200, 800, 1100, 1100, 40, "/search?q=black+running+shoe"),
  step(12, "click", "/search", 23100, 700, 1300, 1150, 45, "Velocity Runner"),
  step(13, "select", "/products/velocity-runner", 25100, 300, 1200, 1700, 50, "size 8"),
  step(14, "click", "/products/velocity-runner", 26600, 900, 1000, 1200, 40, "Add to cart"),
  step(15, "done", "/cart", 28500, 0, 900, 1250, 30),
];

const sum = (pick: (s: TraceStep) => number) => steps.reduce((total, s) => total + pick(s), 0);
const inputTokens = sum((s) => s.inputTokens);
const outputTokens = sum((s) => s.outputTokens);

export const sampleTrace: AgentTrace = {
  runId: "fixture-baseline-001",
  provenance: "fixture",
  siteVersion: "baseline",
  url: "http://localhost:3001",
  task: "Find a black running shoe under $120 in size 8 that is in stock, and add it to my cart.",
  expectedSku: "VEL-BLK-08",
  model: "fixture-model",
  startedAt: "2026-10-24T09:00:00.000Z",
  steps,
  metrics: {
    totalMs: 29400,
    modelMs: sum((s) => s.modelMs),
    browserMs: sum((s) => s.browserMs),
    inputTokens,
    outputTokens,
    toolCalls: steps.filter((s) => s.action !== "done").length,
    // Placeholder pricing: $3 / 1M input tokens, $15 / 1M output tokens.
    estimatedCostUsd: Number(((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(4)),
  },
  outcome: {
    success: true,
    agentClaimedDone: true,
    cart: [{ sku: "VEL-BLK-08", quantity: 1 }],
  },
};
