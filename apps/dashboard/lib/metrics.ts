// Averages over a set of recorded agent runs, computed the same way for the
// baseline at the top of the dashboard and for the comparison at the end.

import type { AgentTrace } from "@agentfix/shared";

export interface RunAverages {
  runs: number;
  verified: number;
  steps: number;
  tokens: number;
  seconds: number;
  /** Total model cost divided by verified purchases; null when none verified. */
  costPerPurchase: number | null;
}

export function averages(runs: AgentTrace[]): RunAverages {
  const n = Math.max(runs.length, 1);
  const sum = (f: (r: AgentTrace) => number) => runs.reduce((t, r) => t + f(r), 0);
  const verified = runs.filter((r) => r.outcome.success).length;
  return {
    runs: runs.length,
    verified,
    steps: sum((r) => r.metrics.toolCalls) / n,
    tokens: sum((r) => r.metrics.inputTokens + r.metrics.outputTokens) / n,
    seconds: sum((r) => r.metrics.totalMs) / n / 1000,
    costPerPurchase: verified === 0 ? null : sum((r) => r.metrics.estimatedCostUsd) / verified,
  };
}

export const usd = (v: number | null) => (v === null ? "n/a" : `$${v.toFixed(5)}`);
export const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/** "−87%" style change from before to after. */
export function change(before: number, after: number): string {
  if (before === 0) return "–";
  const pct = Math.round(((after - before) / before) * 100);
  return pct === 0 ? "no change" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}
