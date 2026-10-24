import { diagnose } from "@agentfix/diagnosis";
import type { AgentTrace, BenchmarkResult, Finding, Provenance, VariantSummary } from "@agentfix/shared";
import { sampleTrace } from "@agentfix/shared/fixtures";
import Link from "next/link";
import { connection } from "next/server";

import { latestBenchmark, recentPatches } from "@/lib/results";

import { PatchPanel } from "./patch-panel";

/** The run with the median tool-call count, as the default to show. */
function medianRunIndex(runs: AgentTrace[]): number {
  const order = runs.map((r, i) => [r.metrics.toolCalls, i] as const).sort((a, b) => a[0] - b[0]);
  return order[Math.floor((order.length - 1) / 2)]?.[1] ?? 0;
}

const provenanceLabel: Record<Provenance, string> = {
  live: "Live run",
  replay: "Replay of a recorded run",
  fixture: "Fixture data: illustrative, not measured",
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const count = (n: number) => n.toLocaleString("en-US");

const severityTone: Record<Finding["severity"], string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  // Render per request so newly saved results show up without a rebuild.
  await connection();
  const benchmark = await latestBenchmark();
  const runs = benchmark?.result.baseline.runs ?? [];
  const requested = Number((await searchParams).run) - 1;
  const runIndex = runs[requested] ? requested : medianRunIndex(runs);
  // Real baseline runs when a benchmark has been saved; the fixture otherwise.
  const trace: AgentTrace = runs[runIndex] ?? sampleTrace;
  const { metrics, outcome } = trace;
  const diagnosis = await diagnose(trace);
  const patches = await recentPatches();
  const flaggedSteps = new Set(
    diagnosis.findings.flatMap((f) => f.evidence.flatMap((e) => e.stepIndexes ?? [])),
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">AgentFix</h1>
          <ProvenanceBadge provenance={trace.provenance} />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Run <code className="font-mono">{trace.runId}</code> · {trace.siteVersion} site ·{" "}
          {trace.url} · model <code className="font-mono">{trace.model}</code>
          {trace.provenance !== "fixture" && (
            <> · recorded {new Date(trace.startedAt).toLocaleString("en-US")}</>
          )}
        </p>
      </header>

      {benchmark && (
        <BenchmarkPanel result={benchmark.result} file={benchmark.file} runIndex={runIndex} />
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Task</h2>
        <p className="mt-2 text-base">{trace.task}</p>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Expected SKU <code className="font-mono">{trace.expectedSku}</code> · Verified cart:{" "}
          {outcome.cart.length === 0
            ? "empty"
            : outcome.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ")}
          {" · "}
          <span
            className={
              outcome.success
                ? "font-medium text-emerald-700 dark:text-emerald-400"
                : "font-medium text-red-700 dark:text-red-400"
            }
          >
            {outcome.success ? "Task verified" : "Task failed"}
          </span>
        </p>
      </section>

      <section aria-labelledby="metrics-heading" className="space-y-3">
        <h2 id="metrics-heading" className="text-lg font-semibold">
          Run metrics
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Tool calls" value={count(metrics.toolCalls)} />
          <Metric
            label="Model tokens"
            value={count(metrics.inputTokens + metrics.outputTokens)}
            detail={`${count(metrics.inputTokens)} in · ${count(metrics.outputTokens)} out`}
          />
          <Metric label="Est. model cost" value={`$${metrics.estimatedCostUsd.toFixed(4)}`} />
          <Metric
            label="Total time"
            value={seconds(metrics.totalMs)}
            detail={`model ${seconds(metrics.modelMs)} · browser ${seconds(metrics.browserMs)}`}
          />
        </div>
      </section>

      <section aria-labelledby="steps-heading" className="space-y-3">
        <h2 id="steps-heading" className="text-lg font-semibold">
          Agent steps
        </h2>
        {flaggedSteps.size > 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Highlighted rows are evidence for a diagnosis finding below.
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 text-right font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Browser</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {trace.steps.map((s) => (
                <tr
                  key={s.index}
                  className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800/60 ${
                    flaggedSteps.has(s.index) ? "bg-amber-50 dark:bg-amber-950/30" : ""
                  }`}
                >
                  <td className="px-3 py-2 tabular-nums text-zinc-500">
                    {s.index}
                    {flaggedSteps.has(s.index) && <span className="sr-only"> (flagged)</span>}
                  </td>
                  <td className="px-3 py-2 font-medium">{s.action}</td>
                  <td className="px-3 py-2">{s.target ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {s.pagePath}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{seconds(s.modelMs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{seconds(s.browserMs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {count(s.inputTokens + s.outputTokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="diagnosis-heading" className="space-y-3">
        <h2 id="diagnosis-heading" className="text-lg font-semibold">
          Diagnosis
        </h2>
        {diagnosis.findings.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No findings for this run.</p>
        ) : (
          diagnosis.findings.map((f) => <FindingCard key={f.kind} finding={f} />)
        )}
      </section>

      <PatchPanel patches={patches} />
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-1 text-xs text-zinc-500">{detail}</div>}
    </div>
  );
}

function BenchmarkPanel({ result, file, runIndex }: { result: BenchmarkResult; file: string; runIndex: number }) {
  const variants = [result.baseline, result.patched].filter((v): v is VariantSummary => v !== undefined);
  return (
    <section aria-labelledby="benchmark-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="benchmark-heading" className="text-lg font-semibold">
          Benchmark
        </h2>
        <ProvenanceBadge provenance={result.provenance} />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {result.repetitions} runs per site with the same agent (
        <code className="font-mono">{result.model}</code>), recorded{" "}
        {new Date(result.createdAt).toLocaleString("en-US")} ·{" "}
        <code className="font-mono">{file}</code>
      </p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 text-right font-medium">Verified success</th>
              <th className="px-3 py-2 text-right font-medium">Avg tool calls</th>
              <th className="px-3 py-2 text-right font-medium">Avg tokens</th>
              <th className="px-3 py-2 text-right font-medium">Median time</th>
              <th className="px-3 py-2 text-right font-medium">Cost per verified success</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.siteVersion} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                <td className="px-3 py-2 font-medium capitalize">
                  {v.siteVersion} <span className="font-normal text-zinc-500">{v.url}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Math.round(v.completionRate * 100)}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{v.avgToolCalls.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {count(Math.round(v.avgInputTokens + v.avgOutputTokens))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{seconds(v.medianTotalMs)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {v.costPerVerifiedSuccessUsd === null ? "no successes" : `$${v.costPerVerifiedSuccessUsd.toFixed(5)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.patched && (
        <p className="text-xs text-zinc-500">Patched-site runs appear here once compare() has been run.</p>
      )}
      <nav aria-label="Baseline runs" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">Showing baseline run:</span>
        {result.baseline.runs.map((r, i) => (
          <Link
            key={r.runId}
            href={`/?run=${i + 1}`}
            aria-current={i === runIndex ? "page" : undefined}
            className={`rounded-md border px-2.5 py-1 tabular-nums ${
              i === runIndex
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {i + 1} · {r.metrics.toolCalls} calls {r.outcome.success ? "✓" : "✗"}
          </Link>
        ))}
      </nav>
    </section>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${severityTone[finding.severity]}`}>
          {finding.severity} severity
        </span>
        <code className="font-mono text-xs text-zinc-500">{finding.kind}</code>
      </div>
      <p className="mt-3 text-sm">{finding.summary}</p>
      <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        {finding.evidence.map((e) => (
          <li key={e.description}>
            {e.description}
            {e.metric && (
              <>
                : <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {count(e.metric.value)}
                </span>
              </>
            )}
            {e.stepIndexes && e.stepIndexes.length > 0 && <> (steps {e.stepIndexes.join(", ")})</>}
          </li>
        ))}
      </ul>
      {finding.candidateFiles.length > 0 && (
        <p className="mt-3 text-xs text-zinc-500">
          Candidate fix files:{" "}
          {finding.candidateFiles.map((file, i) => (
            <span key={file}>
              {i > 0 && ", "}
              <code className="font-mono">{file}</code>
            </span>
          ))}
        </p>
      )}
      <p className="mt-3 text-xs text-zinc-500">A hypothesis from the trace, not a proven root cause.</p>
    </article>
  );
}

function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const tone =
    provenance === "live"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {provenanceLabel[provenance]}
    </span>
  );
}
