import { diagnose } from "@agentfix/diagnosis";
import type { AgentTrace, BenchmarkResult, Finding, Provenance, SiteVersion, VariantSummary } from "@agentfix/shared";
import { sampleTrace } from "@agentfix/shared/fixtures";
import Link from "next/link";
import { connection } from "next/server";

import { apifyAudits } from "@/lib/apify";
import { liveWorktree } from "@/lib/child-process";
import { averages, usd } from "@/lib/metrics";
import { allPatches, latestBenchmark, loadCompare, recentPatches } from "@/lib/results";

import { CommandsSection, ResultsSection } from "./agent-interface-panel";
import { ApifyPanel } from "./apify-panel";
import { OptimizeButton } from "./optimize-button";
import { PatchPanel } from "./patch-panel";
import { Card, FeatureLabel, SectionIntro, StepLabel } from "./ui";

/** The run with the median tool-call count, as the default to show. */
function medianRunIndex(runs: AgentTrace[]): number {
  const order = runs.map((r, i) => [r.metrics.toolCalls, i] as const).sort((a, b) => a[0] - b[0]);
  return order[Math.floor((order.length - 1) / 2)]?.[1] ?? 0;
}

const provenanceLabel: Record<Provenance, string> = {
  live: "Real agent run",
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; site?: string; compare?: string }>;
}) {
  // Render per request so newly saved results show up without a rebuild.
  await connection();
  const params = await searchParams;
  // ?compare=<file> views the runs of one measurement (both stores); otherwise
  // the page lists the newest recorded runs on the original store to optimize.
  const measured = params.compare ? await loadCompare(params.compare) : null;
  const benchmark = measured ? { result: measured, file: `data/results/${params.compare}` } : await latestBenchmark();
  const site: SiteVersion = measured && params.site === "patched" && measured.patched ? "patched" : "baseline";
  const runs = (site === "patched" ? benchmark?.result.patched?.runs : benchmark?.result.baseline.runs) ?? [];
  const requested = Number(params.run) - 1;
  const runIndex = runs[requested] ? requested : medianRunIndex(runs);
  // Real baseline runs when a benchmark has been saved; the fixture otherwise.
  const trace: AgentTrace = runs[runIndex] ?? sampleTrace;
  const { metrics, outcome } = trace;
  // The baseline the rest of the page is compared with: averages over every run shown.
  const avg = runs.length > 0 ? averages(runs) : null;
  const diagnosis = await diagnose(trace);
  // Only fixes generated from the run being viewed.
  const patches = (await recentPatches()).filter((p) => p.traceRunId === trace.runId);
  const everyFix = (await allPatches()).filter((p) => !p.redTeam);
  const droidFixes = everyFix.length;
  // Accepted fixes that can still be made live: what "Choose an earlier fix" offers.
  const hasEarlierFixes = everyFix.some((p) => p.servable);
  // If the newest fix for this run wasn't accepted, Optimize becomes "Try again".
  const lastTry = patches[0]?.status !== "accepted" ? patches[0] : undefined;
  // Which saved fix, if any, the fixed store on localhost:3002 is serving.
  const live = await liveWorktree();
  const apify = measured ? null : await apifyAudits();
  const flaggedSteps = new Set(
    diagnosis.findings.flatMap((f) => f.evidence.flatMap((e) => e.stepIndexes ?? [])),
  );
  const now = Date.now();

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <header className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Perry</h1>
          <ProvenanceBadge provenance={trace.provenance} />
          <Link href="/history" className="ml-auto text-sm text-blue-700 underline dark:text-blue-400">
            Fix history
          </Link>
        </div>
        {!measured && <Intro model={trace.model} storeUrl={trace.url} />}
      </header>

      <section id="measure" aria-labelledby="measure-heading" className="scroll-mt-6 space-y-5">
        <SectionIntro
          label={<StepLabel>{measured ? "A measurement" : "Step 1 · Measure"}</StepLabel>}
          id="measure-heading"
          title={measured ? "Runs from one measurement" : "How an AI agent shops this store today"}
        >
          {measured ? (
            <>
              The same agent ran {benchmark?.result.repetitions} times on each store. Pick a run to see its steps.{" "}
              <Link href="/" className="text-blue-700 underline dark:text-blue-400">
                Back to the dashboard
              </Link>
            </>
          ) : (
            <>
              Before changing anything, Perry measures. It gives a real AI agent a shopping task and lets it use the
              store&apos;s website in a browser, like a person would, several times. Perry records every click, page,
              token and second, then reads the store&apos;s real cart to check it bought the right item. The averages
              below are the baseline that both features try to beat; the comparison at the end of the page uses the
              same measures.
            </>
          )}
        </SectionIntro>

        <Card>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">The task</p>
              <p className="mt-1 text-lg">{trace.task}</p>
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Counts as a success only if</p>
              <p className="mt-1">
                the store&apos;s real cart holds exactly <code className="font-mono">{trace.expectedSku}</code> × 1, the
                one shoe that fits.
              </p>
            </div>
          </div>
        </Card>

        {avg && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Baseline: average of {avg.runs} runs{" "}
              <span className="font-normal text-zinc-500">
                on the {siteName[site].toLowerCase()}
                {benchmark && <>, recorded {new Date(benchmark.result.createdAt).toLocaleString("en-US")}</>}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric label="Verified" value={`${avg.verified} / ${avg.runs}`} detail="right item in the cart" />
              <Metric label="Steps" value={avg.steps.toFixed(1)} detail="browser actions per run" />
              <Metric label="Tokens" value={count(Math.round(avg.tokens))} detail="text the model read and wrote" />
              <Metric label="Cost per purchase" value={usd(avg.costPerPurchase)} detail="model cost per verified purchase" />
              <Metric label="Time" value={`${avg.seconds.toFixed(1)}s`} detail="per run" />
            </div>
          </div>
        )}

        {benchmark && (
          <Card>
            <div className="space-y-1">
              <h3 className="font-semibold">Look inside one run</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Pick a run to see every step the agent took. Highlighted rows are where Perry found wasted effort.
              </p>
            </div>
            <RunPicker result={benchmark.result} file={benchmark.file} site={site} runIndex={runIndex} measurement={!!measured} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric
                small
                label="Steps"
                value={count(metrics.toolCalls)}
                detail={avg ? `average ${avg.steps.toFixed(1)}` : undefined}
              />
              <Metric
                small
                label="Tokens"
                value={count(metrics.inputTokens + metrics.outputTokens)}
                detail={`${count(metrics.inputTokens)} in · ${count(metrics.outputTokens)} out`}
              />
              <Metric small label="Model cost" value={`$${metrics.estimatedCostUsd.toFixed(5)}`} />
              <Metric
                small
                label="Time"
                value={seconds(metrics.totalMs)}
                detail={`model ${seconds(metrics.modelMs)} · browser ${seconds(metrics.browserMs)}`}
              />
            </div>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
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
                      <td className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">{s.pagePath}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{seconds(s.modelMs + s.browserMs)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{count(s.inputTokens + s.outputTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm">
              Cart afterwards:{" "}
              {outcome.cart.length === 0 ? "empty" : outcome.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ")} ·{" "}
              <span
                className={
                  outcome.success
                    ? "font-medium text-emerald-700 dark:text-emerald-400"
                    : "font-medium text-red-700 dark:text-red-400"
                }
              >
                {outcome.success ? "✅ Verified" : "⛔ Not verified"}
              </span>
            </p>
          </Card>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold">What Perry found in this run</h3>
          {diagnosis.findings.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No wasted effort found in this run.</p>
          ) : (
            diagnosis.findings.map((f) => <FindingCard key={f.kind} finding={f} />)
          )}
        </div>
      </section>

      {!measured ? (
        <section id="fix" aria-labelledby="fix-heading" className="scroll-mt-6 space-y-5">
          <SectionIntro
            label={<FeatureLabel n={1} tone="violet" audience="For agents that browse websites" />}
            id="fix-heading"
            title="Droid fixes the website"
          >
            Many AI agents, such as ChatGPT&apos;s agent and Claude in Chrome, can only use a store the way a person
            does: load a page, read it, click. Step 1 shows where that wastes effort on this store. Perry hands that
            diagnosis to Factory Droid, an AI coding agent, which edits the store&apos;s own search page so the agent
            finds its answer sooner. The website changes; the agents don&apos;t need anything new.
          </SectionIntro>

          <Card>
            <h3 className="font-semibold">How Droid fixes it</h3>
            <ol className="grid gap-3 lg:grid-cols-3">
              <FixStep n={1} title="Droid reads the problem">
                The diagnosis from Step 1 (for example, &ldquo;opened 4 product pages to buy 1&rdquo;) and the code for
                the store&apos;s search page.
              </FixStep>
              <FixStep n={2} title="Droid edits a throwaway copy">
                It may change only two files: the search-results card and the search code. Prices, stock, the task and
                Perry&apos;s checks are locked, and shell commands are blocked.
              </FixStep>
              <FixStep n={3} title="Perry checks it before it goes live">
                Only allowed files changed, the store still builds, and every price and stock level still matches the
                catalog. Then the same agent shops the fixed store, to measure whether it helped.
              </FixStep>
            </ol>
            {diagnosis.findings.some((f) => f.kind === "excessive_navigation") && (
              <OptimizeButton
                key={lastTry?.file ?? "fresh"}
                benchmark={benchmark && runs[runIndex] ? benchmark.file.replace("data/results/", "") : undefined}
                run={runIndex + 1}
                retryOf={lastTry?.file}
                attempt={lastTry?.attempt}
                hasEarlierFixes={hasEarlierFixes}
              />
            )}
          </Card>

          <PatchPanel patches={patches} live={live} now={now} />
          <p className="text-sm">
            <Link href="/history" className="font-medium text-blue-700 underline dark:text-blue-400">
              See all Droid fixes ({droidFixes}) →
            </Link>{" "}
            <span className="text-zinc-500">including other runs and ones archived by a reset</span>
          </p>
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {site === "patched" ? (
            <>
              This run used the <strong>fixed store</strong>, so there is nothing to fix. Compare its steps with an
              original-store run from the same measurement.
            </>
          ) : (
            <>This run is part of a measurement. To make a new fix, go back to the dashboard.</>
          )}{" "}
          <Link href="/" className="font-medium text-blue-700 underline dark:text-blue-400">
            Back to the dashboard
          </Link>
        </p>
      )}

      {!measured && <CommandsSection now={now} />}
      {!measured && <ResultsSection baseline={avg} now={now} />}
      {apify && <ApifyPanel data={apify} now={now} />}
    </main>
  );
}

const overview = [
  { href: "#measure", label: "Step 1", title: "Measure", body: "A real AI agent shops the store. Perry records every step and checks the cart." },
  { href: "#fix", label: "Feature 1", title: "Fix the website", body: "Droid edits the store's search page, for agents that browse.", tone: "violet" },
  { href: "#commands", label: "Feature 2", title: "Go straight to the catalog", body: "An even better way: Droid writes commands that answer from the store's catalog, for any agent via MCP.", tone: "blue" },
  { href: "#results", label: "Results", title: "Compare", body: "Same agent, same task, three ways in. Every purchase verified." },
] as const;

function Intro({ model, storeUrl }: { model: string; storeUrl: string }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-xl font-medium leading-snug tracking-tight">
          Perry makes online stores work for AI shopping agents, and proves it with verified purchases.
        </p>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          AI agents are starting to shop for people, but stores are built for human eyes. Perry sends a real AI agent to
          a store with a shopping task, records every step, and finds where it wastes time and money. Then it uses
          Factory Droid, an AI coding agent, to improve the store in two ways, and measures each with the same agent. A
          purchase only counts if the store&apos;s real cart holds exactly the right item.
        </p>
        <p className="text-xs text-zinc-500">
          This demo uses a small shoe store we built, running at <code className="font-mono">{storeUrl}</code>, and{" "}
          <code className="font-mono">{model}</code> as the shopping agent.
        </p>
      </div>
      <nav aria-label="What this page shows" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {overview.map((o) => (
          <a
            key={o.href}
            href={o.href}
            className={`group space-y-1 rounded-xl border p-4 transition-colors ${
              "tone" in o && o.tone === "violet"
                ? "border-violet-200 bg-violet-50/60 hover:bg-violet-50 dark:border-violet-900 dark:bg-violet-950/20"
                : "tone" in o && o.tone === "blue"
                  ? "border-blue-200 bg-blue-50/60 hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20"
                  : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{o.label}</p>
            <p className="font-semibold group-hover:underline">{o.title}</p>
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{o.body}</p>
          </a>
        ))}
      </nav>
    </div>
  );
}

function FixStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="space-y-2 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-950/40">
      <p className="flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white"
        >
          {n}
        </span>
        {title}
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">{children}</p>
    </li>
  );
}

function Metric({ label, value, detail, small }: { label: string; value: string; detail?: string; small?: boolean }) {
  return (
    <div
      className={
        small
          ? "rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950/40"
          : "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      }
    >
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${small ? "text-lg" : "text-2xl"}`}>{value}</div>
      {detail && <div className="mt-1 text-xs text-zinc-500">{detail}</div>}
    </div>
  );
}

const siteName: Record<SiteVersion, string> = {
  baseline: "Original store",
  patched: "With the fix",
  "agent-interface": "Shop commands",
};

/**
 * Buttons for the runs the page can show. On the dashboard: recorded runs on
 * the original store. In a measurement view: that measurement's runs on both stores.
 */
function RunPicker({
  result,
  file,
  site,
  runIndex,
  measurement,
}: {
  result: BenchmarkResult;
  file: string;
  site: SiteVersion;
  runIndex: number;
  measurement: boolean;
}) {
  const variants = measurement
    ? [result.baseline, result.patched].filter((v): v is VariantSummary => v !== undefined)
    : [result.baseline];
  const name = file.replace("data/results/", "");
  return (
    <div className="space-y-2">
      {variants.map((v) => (
        <nav key={v.siteVersion} aria-label={`${siteName[v.siteVersion]} runs`} className="flex flex-wrap items-center gap-2 text-sm">
          {measurement && <span className="w-32 text-zinc-500">{siteName[v.siteVersion]}:</span>}
          {v.runs.map((r, i) => {
            const current = v.siteVersion === site && i === runIndex;
            const href = measurement
              ? `/?compare=${name}${v.siteVersion === "patched" ? "&site=patched" : ""}&run=${i + 1}`
              : `/?run=${i + 1}`;
            return (
              <Link
                key={r.runId}
                href={href}
                // Stay where you are on the page; only the run below changes.
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={`rounded-md border px-2.5 py-1 tabular-nums ${
                  current
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                Run {i + 1} · {r.metrics.toolCalls} steps {r.outcome.success ? "✓" : "✗"}
              </Link>
            );
          })}
        </nav>
      ))}
      <p className="text-xs text-zinc-500">
        <code className="font-mono">{file}</code>
      </p>
    </div>
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
