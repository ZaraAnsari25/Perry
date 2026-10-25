// Views of recorded browser runs: averages, the run picker, one run's steps,
// and Perry's findings.

import type { AgentTrace, BenchmarkResult, Finding, Provenance, SiteVersion, VariantSummary } from "@agentfix/shared";
import Link from "next/link";

import { type RunAverages, usd } from "@/lib/metrics";

import { StateMark } from "./icons";
import { Chip } from "./ui";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const count = (n: number) => n.toLocaleString("en-US");

export const siteName: Record<SiteVersion, string> = {
  baseline: "Original store",
  patched: "With the fix",
  "agent-interface": "Shop commands",
};

const provenanceLabel: Record<Provenance, string> = {
  live: "Real agent runs",
  replay: "Replay of recorded runs",
  fixture: "Fixture data: illustrative, not measured",
};

export function ProvenanceChip({ provenance }: { provenance: Provenance }) {
  return <Chip tone={provenance === "live" ? "perry" : "amber"}>{provenanceLabel[provenance]}</Chip>;
}

/** The baseline: one row of averages, figures in mono. */
export function AverageRow({ avg }: { avg: RunAverages }) {
  const cells = [
    { label: "Verified", value: `${avg.verified}/${avg.runs}`, note: "right shoe in the cart" },
    { label: "Steps", value: avg.steps.toFixed(1), note: "browser actions per run" },
    { label: "Tokens", value: count(Math.round(avg.tokens)), note: "text the model read and wrote" },
    { label: "Cost per purchase", value: usd(avg.costPerPurchase), note: "model cost per verified purchase" },
    { label: "Time", value: `${avg.seconds.toFixed(1)}s`, note: "per run" },
  ];
  return (
    <dl className="grid grid-cols-2 divide-seam overflow-hidden rounded-xl border border-seam bg-panel sm:grid-cols-5 sm:divide-x">
      {cells.map((c) => (
        <div key={c.label} className="border-b border-seam p-4 sm:border-b-0">
          <dt className="text-xs font-medium text-muted">{c.label}</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{c.value}</dd>
          <dd className="mt-0.5 text-xs text-faint">{c.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Buttons for the runs a page can show; they keep the scroll position. */
export function RunPicker({
  result,
  file,
  site,
  runIndex,
  measurement,
  basePath,
}: {
  result: BenchmarkResult;
  file: string;
  site: SiteVersion;
  runIndex: number;
  measurement: boolean;
  basePath: string;
}) {
  const variants = measurement
    ? [result.baseline, result.patched].filter((v): v is VariantSummary => v !== undefined)
    : [result.baseline];
  const name = file.replace("data/results/", "");
  return (
    <div className="space-y-2">
      {variants.map((v) => (
        <nav key={v.siteVersion} aria-label={`${siteName[v.siteVersion]} runs`} className="flex flex-wrap items-center gap-1.5 text-sm">
          {measurement && <span className="w-32 text-muted">{siteName[v.siteVersion]}</span>}
          {v.runs.map((r, i) => {
            const current = v.siteVersion === site && i === runIndex;
            const href = measurement
              ? `${basePath}?compare=${name}${v.siteVersion === "patched" ? "&site=patched" : ""}&run=${i + 1}`
              : `${basePath}?run=${i + 1}`;
            return (
              <Link
                key={r.runId}
                href={href}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums transition-colors ${
                  current ? "border-ink bg-ink text-ground" : "border-seam bg-panel hover:border-faint"
                }`}
              >
                Run {i + 1} · {r.metrics.toolCalls} steps
                <StateMark state={r.outcome.success ? "done" : "failed"} className="h-3.5 w-3.5" />
              </Link>
            );
          })}
        </nav>
      ))}
    </div>
  );
}

/** One run: its numbers next to the average, every step, and the cart it ended with. */
export function RunDetail({ trace, avg, flagged }: { trace: AgentTrace; avg: RunAverages | null; flagged: Set<number> }) {
  const { metrics, outcome } = trace;
  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-muted tabular-nums">
        {metrics.toolCalls} steps{avg && ` (average ${avg.steps.toFixed(1)})`} · {count(metrics.inputTokens + metrics.outputTokens)}{" "}
        tokens · ${metrics.estimatedCostUsd.toFixed(5)} · {seconds(metrics.totalMs)} (model {seconds(metrics.modelMs)}, browser{" "}
        {seconds(metrics.browserMs)})
      </p>
      <div className="overflow-x-auto rounded-lg border border-seam">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-seam bg-ground text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Page</th>
              <th className="px-3 py-2 text-right font-medium">Time</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {trace.steps.map((s) => (
              <tr
                key={s.index}
                className={`border-b border-seam last:border-0 ${flagged.has(s.index) ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-faint tabular-nums">
                  {s.index}
                  {flagged.has(s.index) && <span className="sr-only"> (wasted)</span>}
                </td>
                <td className="px-3 py-2 font-medium">{s.action}</td>
                <td className="px-3 py-2">{s.target ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted">{s.pagePath}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{seconds(s.modelMs + s.browserMs)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{count(s.inputTokens + s.outputTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-2 text-sm">
        <StateMark state={outcome.success ? "done" : "failed"} />
        <span className="font-medium">{outcome.success ? "Verified" : "Not verified"}</span>
        <span className="text-muted">
          · cart afterwards: {outcome.cart.length === 0 ? "empty" : outcome.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ")}
        </span>
      </p>
    </div>
  );
}

const severityTone: Record<Finding["severity"], "amber" | "neutral"> = { high: "amber", medium: "amber", low: "neutral" };

export function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="space-y-3 rounded-xl border border-seam bg-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={severityTone[finding.severity]}>{finding.severity} severity</Chip>
      </div>
      <p className="text-base">{finding.summary}</p>
      <ul className="space-y-1 text-sm text-muted">
        {finding.evidence.map((e) => (
          <li key={e.description}>
            {e.description}
            {e.metric && (
              <>
                : <span className="font-mono font-medium text-ink tabular-nums">{count(e.metric.value)}</span>
              </>
            )}
            {e.stepIndexes && e.stepIndexes.length > 0 && <> (steps {e.stepIndexes.join(", ")})</>}
          </li>
        ))}
      </ul>
      {finding.candidateFiles.length > 0 && (
        <p className="text-xs text-faint">
          Where a fix would go:{" "}
          {finding.candidateFiles.map((file, i) => (
            <span key={file}>
              {i > 0 && ", "}
              <code className="font-mono">{file}</code>
            </span>
          ))}
        </p>
      )}
      <p className="text-xs text-faint">A hypothesis from the recorded steps, not a proven root cause.</p>
    </article>
  );
}
