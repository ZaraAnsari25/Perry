import type { AgentTrace, BenchmarkResult, VariantSummary } from "@agentfix/shared";

import { agentGuide, latestInterfaceResult, latestThreeWay } from "@/lib/interface";

import { age } from "./patch-panel";

/** Shell output longer than this is collapsed in the transcript. */
const LONG_OUTPUT = 300;

const verdictLabel = { improved: "Improved", no_change: "No clear change", regressed: "Got worse" } as const;
const verdictTone = {
  improved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  no_change: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  regressed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
} as const;

function change(before: number, after: number): string {
  if (before === 0) return "–";
  const pct = Math.round(((after - before) / before) * 100);
  return pct === 0 ? "no change" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

const usd = (v: number | null) => (v === null ? "n/a" : `$${v.toFixed(5)}`);
const tokens = (v: VariantSummary) => Math.round(v.avgInputTokens + v.avgOutputTokens);

function completion(v: VariantSummary): string {
  const verified = v.runs.filter((r) => r.outcome.success).length;
  return `${verified} / ${v.runs.length} (${Math.round(v.completionRate * 100)}%)`;
}

/**
 * "Same agent, three ways in": the original website, the Droid-fixed website
 * and the agent interface, measured with the same agent, task and cart check.
 * Renders nothing until there is a result or a guide to show.
 */
export async function AgentInterfacePanel({ now }: { now: number }) {
  const [threeWay, interfaceOnly, guide] = await Promise.all([latestThreeWay(), latestInterfaceResult(), agentGuide()]);
  if (!threeWay && !interfaceOnly && !guide) return null;

  const runs = threeWay?.result.agentInterface?.runs ?? interfaceOnly?.result.baseline.runs ?? [];
  const transcript = runs.find((r) => r.outcome.success) ?? runs[0];
  const transcriptSource = threeWay ?? interfaceOnly;

  return (
    <section aria-labelledby="interface-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="interface-heading" className="text-lg font-semibold">
          Same agent, three ways in
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          One task, one model, one cart check. Only the website or the way in changes.
        </p>
      </div>

      {threeWay ? (
        <Comparison result={threeWay.result} file={threeWay.file} now={now} />
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Three-way comparison not run yet.
        </p>
      )}

      {transcript && transcriptSource && (
        <Transcript trace={transcript} result={transcriptSource.result} file={transcriptSource.file} now={now} />
      )}

      {guide && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold">What the agent sees</h3>
          <p className="text-xs text-zinc-500">
            The guide in the agent&apos;s first message, generated from the store&apos;s catalog {age(guide.generatedAt, now)}. The
            agent then runs <code className="font-mono">shop</code> commands through one sandboxed bash tool: no files, no
            network, only the store&apos;s own data and its real cart.
          </p>
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100">
            {guide.guide}
          </pre>
        </div>
      )}
    </section>
  );
}

function ResultBadge({ result, file, now }: { result: BenchmarkResult; file: string; now: number }) {
  return (
    <div className="space-y-2">
      {result.provenance === "fixture" && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          Sample data, not a real run
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {result.provenance === "live" ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            Real agent runs, recorded
          </span>
        ) : result.provenance === "replay" ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            Replay of recorded runs
          </span>
        ) : null}
        <span>
          <code className="font-mono">{file.replace("data/results/", "")}</code> · {age(result.createdAt, now)}
        </span>
      </div>
    </div>
  );
}

function Comparison({ result, file, now }: { result: BenchmarkResult; file: string; now: number }) {
  const original = result.baseline;
  const conditions: {
    label: string;
    detail: string;
    v: VariantSummary;
    verdict?: BenchmarkResult["verdict"];
    commands?: boolean;
  }[] = [
    { label: "Original website", detail: "browser", v: original },
    ...(result.patched ? [{ label: "Droid-fixed website", detail: "browser", v: result.patched, verdict: result.verdict }] : []),
    ...(result.agentInterface
      ? [{ label: "Agent interface", detail: "shop commands", v: result.agentInterface, verdict: result.agentInterfaceVerdict, commands: true }]
      : []),
  ];
  const costs = conditions.map((c) => c.v.costPerVerifiedSuccessUsd ?? 0);
  const maxCost = Math.max(...costs, Number.EPSILON);

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <ResultBadge result={result} file={file} now={now} />

      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 text-right font-medium">Verified</th>
              <th className="px-3 py-2 text-right font-medium">Avg steps*</th>
              <th className="px-3 py-2 text-right font-medium">Avg tokens</th>
              <th className="px-3 py-2 text-right font-medium">Cost per verified purchase</th>
              <th className="px-3 py-2 text-right font-medium">Median time</th>
            </tr>
          </thead>
          <tbody>
            {conditions.map((c) => (
              <tr key={c.label} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                <td className="px-3 py-2">
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-zinc-500">{c.detail}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{completion(c.v)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.v.avgToolCalls.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{tokens(c.v).toLocaleString("en-US")}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{usd(c.v.costPerVerifiedSuccessUsd)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(c.v.medianTotalMs / 1000).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        * Steps are browser actions on the websites and shell commands on the agent interface. Model{" "}
        <code className="font-mono">{result.model}</code>, {result.repetitions} runs per condition, same task and cart
        check.
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {conditions
          .filter((c) => c.v !== original)
          .map((c) => {
            const before = original.costPerVerifiedSuccessUsd;
            const after = c.v.costPerVerifiedSuccessUsd;
            return (
              <li key={c.label} className="space-y-1 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.label} vs. original</span>
                  {c.verdict ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${verdictTone[c.verdict]}`}>
                      {verdictLabel[c.verdict]}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500">no verdict saved</span>
                  )}
                </div>
                <p className="tabular-nums text-zinc-700 dark:text-zinc-300">
                  Cost per verified purchase {before !== null && after !== null ? change(before, after) : "–"} · steps{" "}
                  {change(original.avgToolCalls, c.v.avgToolCalls)}
                </p>
              </li>
            );
          })}
      </ul>

      <figure className="space-y-2">
        <figcaption className="text-xs font-medium uppercase tracking-wide text-zinc-500">Cost per verified purchase</figcaption>
        <div className="space-y-1.5">
          {conditions.map((c, i) => (
            <div key={c.label} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm">
              <span className="truncate">{c.label}</span>
              <div className="flex items-center gap-2">
                <div
                  aria-hidden
                  className="h-4 rounded-sm bg-blue-600 dark:bg-blue-500"
                  style={{ width: `${Math.max((costs[i]! / maxCost) * 100, 1)}%`, maxWidth: "calc(100% - 5.5rem)" }}
                />
                <span className="tabular-nums text-xs">{usd(c.v.costPerVerifiedSuccessUsd)}</span>
              </div>
            </div>
          ))}
        </div>
      </figure>

      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Many agents can only browse, so the website has to work for them. Agents that use tools can use the interface.
        Perry measures every path with the same agent and the same verified cart.{" "}
        <span className="text-zinc-500">The Droid fix changes the website&apos;s HTML; the agent interface leaves the website alone.</span>
      </p>
    </div>
  );
}

function Transcript({ trace, result, file, now }: { trace: AgentTrace; result: BenchmarkResult; file: string; now: number }) {
  const done = trace.steps.find((s) => s.action === "done");
  const shell = trace.steps.filter((s) => s.action === "shell");
  const { outcome } = trace;
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">One agent-interface run, command by command</h3>
        <p className="text-xs text-zinc-500">
          Run <code className="font-mono">{trace.runId}</code> · {shell.length} command{shell.length === 1 ? "" : "s"} ·{" "}
          {result.provenance === "fixture" ? (
            <strong className="text-amber-800 dark:text-amber-300">sample data, not a real run</strong>
          ) : (
            <>recorded {age(trace.startedAt, now)}</>
          )}{" "}
          · from <code className="font-mono">{file.replace("data/results/", "")}</code>
        </p>
      </div>
      <ol className="space-y-2">
        {shell.map((s) => {
          const output = s.output ?? "";
          return (
            <li key={s.index} className="rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100">
              <div className="flex gap-2">
                {!s.ok && (
                  <span className="text-red-400" aria-label="failed">
                    ✗
                  </span>
                )}
                <span className="whitespace-pre-wrap break-all">$ {s.command ?? s.target ?? ""}</span>
              </div>
              {output &&
                (output.length > LONG_OUTPUT ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-zinc-400">Show output ({output.split("\n").length} lines)</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all text-zinc-300">{output}</pre>
                  </details>
                ) : (
                  <pre className="mt-1 whitespace-pre-wrap break-all text-zinc-300">{output}</pre>
                ))}
              {!s.ok && s.error && <p className="mt-1 text-red-400">{s.error}</p>}
            </li>
          );
        })}
      </ol>
      {done?.target && (
        <p className="text-sm">
          <span className="text-zinc-500">Agent&apos;s summary: </span>
          {done.target}
        </p>
      )}
      <p
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          outcome.success
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        }`}
      >
        {outcome.success ? "✅ Verified" : "⛔ Not verified"} · cart:{" "}
        {outcome.cart.length === 0 ? "empty" : outcome.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ")}
        {!outcome.success && outcome.reason ? ` · ${outcome.reason}` : ""}
      </p>
    </div>
  );
}
