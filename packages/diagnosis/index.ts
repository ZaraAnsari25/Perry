// Trace diagnosis: deterministic rules over an AgentTrace. No model calls, so
// the same trace always yields the same findings.

import { DROID_ALLOWED_FILES } from "@agentfix/shared";
import type { AgentTrace, Diagnose, Finding, TraceStep } from "@agentfix/shared";

const PRODUCT_PAGE = /^\/products\/[^/]+/;

const productPath = (step: TraceStep | undefined) =>
  step ? PRODUCT_PAGE.exec(step.pagePath)?.[0] : undefined;

/** A run of consecutive steps on one product page, plus the step that opened it. */
interface ProductVisit {
  path: string;
  opener?: TraceStep;
  steps: TraceStep[];
}

function productVisits(steps: TraceStep[]): ProductVisit[] {
  const visits: ProductVisit[] = [];
  steps.forEach((step, i) => {
    const path = productPath(step);
    if (!path) return;
    const prev = steps[i - 1];
    if (productPath(prev) === path) {
      visits.at(-1)!.steps.push(step);
    } else {
      visits.push({ path, opener: productPath(prev) ? undefined : prev, steps: [step] });
    }
  });
  return visits;
}

/**
 * The task needs one product. Every product page the agent opened and left
 * without buying is overhead the search results could have prevented: the
 * click that opened it plus every step on it (including navigating back).
 */
function excessiveNavigation(trace: AgentTrace): Finding | null {
  const visits = productVisits(trace.steps);
  // The last visit is where the agent added to cart; the rest were checks.
  const wasted = visits.slice(0, -1);
  if (wasted.length === 0) return null;

  const overhead = new Set<number>();
  for (const visit of wasted) {
    if (visit.opener) overhead.add(visit.opener.index);
    for (const s of visit.steps) overhead.add(s.index);
  }
  const steps = trace.steps.filter((s) => overhead.has(s.index));
  const tokens = steps.reduce((t, s) => t + s.inputTokens + s.outputTokens, 0);
  const ms = steps.reduce((t, s) => t + s.modelMs + s.browserMs, 0);
  const toolCalls = steps.filter((s) => s.action !== "done").length;
  const pages = wasted.map((v) => v.path);

  return {
    kind: "excessive_navigation",
    severity: wasted.length >= 3 ? "high" : wasted.length === 2 ? "medium" : "low",
    summary:
      `The agent opened ${visits.length} product pages to buy 1 product. ` +
      `${wasted.length} of them (${pages.join(", ")}) were only checked and left, which suggests ` +
      `the search results don't show the details the task needs (color, category, size stock).`,
    evidence: [
      {
        description: "Product pages opened (the task needs 1)",
        stepIndexes: [...overhead].sort((a, b) => a - b),
        metric: { name: "product_pages_visited", value: visits.length, threshold: 1 },
      },
      {
        description: "Tool calls spent on those visits",
        metric: { name: "overhead_tool_calls", value: toolCalls, threshold: 0 },
      },
      {
        description: "Model tokens spent on those visits",
        metric: { name: "overhead_tokens", value: tokens, threshold: 0 },
      },
      {
        description: "Model and browser time spent on those visits (ms)",
        metric: { name: "overhead_ms", value: ms, threshold: 0 },
      },
    ],
    candidateFiles: [...DROID_ALLOWED_FILES],
  };
}

function repeatedFailedActions(trace: AgentTrace): Finding | null {
  const failed = trace.steps.filter((s) => !s.ok);
  if (failed.length < 2) return null;
  return {
    kind: "repeated_failed_actions",
    severity: failed.length >= 4 ? "high" : "medium",
    summary: `${failed.length} agent actions failed during the run.`,
    evidence: [
      {
        description: failed.map((s) => `#${s.index} ${s.action}: ${s.error ?? "failed"}`).join("; "),
        stepIndexes: failed.map((s) => s.index),
        metric: { name: "failed_actions", value: failed.length, threshold: 1 },
      },
    ],
    candidateFiles: [],
  };
}

const rules = [excessiveNavigation, repeatedFailedActions];

export const diagnose: Diagnose = async (trace) => ({
  runId: trace.runId,
  provenance: trace.provenance,
  findings: rules.map((rule) => rule(trace)).filter((f): f is Finding => f !== null),
  createdAt: new Date().toISOString(),
});
