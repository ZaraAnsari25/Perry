import type { AgentTrace, BenchmarkResult, VariantSummary } from "@agentfix/shared";

import { type InterfaceGen, agentGuide, latestInterfaceGen, latestInterfaceResult, latestThreeWay } from "@/lib/interface";

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
 * The agent-interface section: what it is, how it compares with the websites
 * (same agent, task and cart check), one run command by command, and Droid
 * building the same commands. Renders nothing until there is something to show.
 */
export async function AgentInterfacePanel({ now }: { now: number }) {
  const [threeWay, interfaceOnly, guide, generated] = await Promise.all([
    latestThreeWay(),
    latestInterfaceResult(),
    agentGuide(),
    latestInterfaceGen(),
  ]);
  if (!threeWay && !interfaceOnly && !guide && !generated) return null;

  const runs = threeWay?.result.agentInterface?.runs ?? interfaceOnly?.result.baseline.runs ?? [];
  const transcript = runs.find((r) => r.outcome.success) ?? runs[0];
  const transcriptSource = threeWay ?? interfaceOnly;

  return (
    <section aria-labelledby="interface-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="interface-heading" className="text-lg font-semibold">
          A second way in: <code className="font-mono">shop</code> commands for AI agents
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Fixing the website helps agents that browse. Agents that can run tools don&apos;t need web pages at all: Perry
          has Factory Droid write <code className="font-mono">shop</code> commands from the store&apos;s own code, checks
          them, and gives them to agents.
        </p>
      </div>

      <HowItWorks />

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

      {generated && <GeneratedCard gen={generated} measuredWith={implementations(threeWay?.result.agentInterface?.runs ?? [])} now={now} />}

      {guide && (
        <details className="group rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer text-sm font-semibold">
            What the agent sees
            <span className="ml-2 text-xs font-normal text-zinc-500">the guide in its first message</span>
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-zinc-500">
              Generated from the store&apos;s catalog {age(guide.generatedAt, now)}. The agent runs{" "}
              <code className="font-mono">shop</code> commands through one sandboxed bash tool: no files, no network,
              only the store&apos;s own data and its real cart.
            </p>
            <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100">
              {guide.guide}
            </pre>
          </div>
        </details>
      )}
    </section>
  );
}

const steps = [
  {
    title: "Droid writes the commands",
    body: "From the store's catalog and cart code. Perry checks them before any agent can use them (details below).",
  },
  {
    title: "The agent runs commands",
    body: "One search with filters, then one add to cart. Every price, size and stock level comes from the live catalog; nothing is made up.",
  },
  {
    title: "Perry checks the real cart",
    body: "A purchase counts only if the store's own cart holds exactly the right item, the same check as on the websites.",
  },
];

function HowItWorks() {
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white dark:bg-blue-500"
          >
            {i + 1}
          </span>
          <span className="space-y-1">
            <span className="block text-sm font-medium">{s.title}</span>
            <span className="block text-xs text-zinc-600 dark:text-zinc-400">{s.body}</span>
          </span>
        </li>
      ))}
    </ol>
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
  }[] = [
    { label: "Original website", detail: "agent clicks through pages", v: original },
    ...(result.patched
      ? [{ label: "Droid-fixed website", detail: "agent clicks through pages", v: result.patched, verdict: result.verdict }]
      : []),
    ...(result.agentInterface
      ? [{ label: "Shop commands", detail: "agent runs commands", v: result.agentInterface, verdict: result.agentInterfaceVerdict }]
      : []),
  ];
  const costs = conditions.map((c) => c.v.costPerVerifiedSuccessUsd ?? 0);
  const maxCost = Math.max(...costs, Number.EPSILON);
  const before = original.costPerVerifiedSuccessUsd;
  const commands = result.agentInterface;
  const saving =
    commands && before && commands.costPerVerifiedSuccessUsd !== null
      ? Math.round((1 - commands.costPerVerifiedSuccessUsd / before) * 100)
      : null;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Same agent, three ways in</h3>
        <p className="text-xs text-zinc-500">
          The same task (&ldquo;{result.task}&rdquo;), model and cart check each time.
        </p>
      </div>

      {commands && saving !== null && (
        <p className="text-2xl font-semibold tracking-tight">
          {saving > 0 ? `${saving}% cheaper` : saving < 0 ? `${-saving}% more expensive` : "Same cost"}{" "}
          <span className="text-base font-normal text-zinc-600 dark:text-zinc-400">
            per verified purchase with shop commands than on the original website ·{" "}
            {commands.avgToolCalls.toFixed(0)} commands instead of {original.avgToolCalls.toFixed(1)} browser steps
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-3 py-2 font-medium">Way in</th>
              <th className="px-3 py-2 font-medium">Cost per verified purchase</th>
              <th className="px-3 py-2 text-right font-medium">Steps</th>
              <th className="px-3 py-2 text-right font-medium">Median time</th>
              <th className="px-3 py-2 text-right font-medium">Verified</th>
            </tr>
          </thead>
          <tbody>
            {conditions.map((c, i) => {
              const after = c.v.costPerVerifiedSuccessUsd;
              return (
                <tr key={c.label} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="px-3 py-2">
                    <span className="font-medium">{c.label}</span>
                    <span className="block text-xs text-zinc-500">{c.detail}</span>
                  </td>
                  <td className="w-1/2 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div aria-hidden className="min-w-16 flex-1">
                        <div
                          className="h-3 rounded-sm bg-blue-600 dark:bg-blue-500"
                          style={{ width: `${Math.max((costs[i]! / maxCost) * 100, 1)}%` }}
                        />
                      </div>
                      <span className="w-16 font-medium tabular-nums">{usd(after)}</span>
                      <span className="w-14">
                        {c.v !== original && before !== null && after !== null && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${verdictTone[c.verdict ?? "no_change"]}`}
                            title={c.verdict ? verdictLabel[c.verdict] : "no verdict saved"}
                          >
                            {change(before, after)}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.v.avgToolCalls.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{(c.v.medianTotalMs / 1000).toFixed(1)}s</td>
                  <td className="px-3 py-2 text-right tabular-nums">{completion(c.v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Many agents can only browse, so the website has to work for them; the Droid fix changes its HTML. Agents that
        use tools can use the commands, which leave the website alone. Perry measures both with the same agent and the
        same verified cart.
      </p>

      <div className="space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        <ResultBadge result={result} file={file} now={now} />
        <p>
          Steps are browser actions on the websites and commands with shop. Model{" "}
          <code className="font-mono">{result.model}</code>, {result.repetitions} runs each, average{" "}
          {conditions.map((c) => `${tokens(c.v).toLocaleString("en-US")}`).join(" / ")} tokens.{" "}
          {result.agentInterface && <ImplementationNote runs={result.agentInterface.runs} />}
        </p>
      </div>
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
        <h3 className="text-sm font-semibold">
          Watch one run: {shell.length} command{shell.length === 1 ? "" : "s"},{" "}
          {outcome.success ? "verified purchase" : "not verified"}
        </h3>
        <p className="text-xs text-zinc-500">
          Everything the agent typed and everything it got back. Run <code className="font-mono">{trace.runId}</code> ·{" "}
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

/** Which `shop` implementation the interface runs used (meta.interfaceImpl, recorded by the runner). */
function implementations(runs: AgentTrace[]): string[] {
  return [...new Set(runs.flatMap((r) => (r.meta?.interfaceImpl ? [r.meta.interfaceImpl] : [])))];
}

function ImplementationNote({ runs }: { runs: AgentTrace[] }) {
  const impls = implementations(runs);
  if (impls.length === 0) return null;
  const name = (i: string) => (i === "generated" ? "generated by Droid" : i === "handwritten" ? "hand-written" : i);
  return <>Interface commands: {impls.map(name).join(" and ")}.</>;
}

/** Perry's gates on Droid's code (packages/optimizer/generate-interface.ts), in plain words. */
const gateInfo: Record<string, { name: string; why: string }> = {
  allowlist: {
    name: "Changed only its one allowed file",
    why: "So it can't touch prices, stock, the cart or the checks themselves.",
  },
  independence: {
    name: "Wrote its own code",
    why: "No imports from our version and no copied blocks, so it really was built from the store's code.",
  },
  typecheck: { name: "Compiles", why: "The whole project still builds with Droid's file in it." },
  "contract tests": {
    name: "Every answer matches the catalog",
    why: "The same tests as our version, including thousands of search combinations: nothing wrong returned, nothing missed.",
  },
  integration: {
    name: "A real purchase verifies",
    why: "It added the right shoe to the real store's cart; sold-out and duplicate requests left the cart unchanged.",
  },
};

const readsList = [
  { what: "The product catalog", file: "apps/storefront/lib/catalog.ts", note: "products, prices, sizes, stock" },
  { what: "The cart API", file: "apps/storefront/app/api/cart/route.ts", note: "how to read the cart and add to it" },
  { what: "Perry's standard for shop commands", file: "packages/agent-interface/CONTRACT.md", note: "which commands, exact output" },
];

/** The newest run in which Droid wrote the shop commands, with Perry's gates. */
function GeneratedCard({ gen, measuredWith, now }: { gen: InterfaceGen; measuredWith: string[]; now: number }) {
  const accepted = gen.status === "accepted";
  const passed = gen.gates.filter((g) => g.ok && !g.skipped).length;
  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">How these commands were made: Droid wrote them, Perry checked them</h3>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {gen.provenance === "fixture" ? "Scripted test, not Droid" : "Recorded run"}
          </span>
        </div>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Why:</span> no store should need someone to
          hand-write commands for AI agents. So Perry has Factory Droid write them from the store&apos;s own code, and
          only lets agents use them once they pass every check. The same works for any store.
        </p>
      </div>

      <ol className="grid gap-3 lg:grid-cols-3">
        <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">1 · What Droid reads</p>
          <ul className="space-y-1.5 text-sm">
            {readsList.map((r) => (
              <li key={r.file}>
                {r.what} <span className="text-zinc-500">({r.note})</span>
                <code className="block font-mono text-xs text-zinc-500">{r.file}</code>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            Not our hand-written reference version: it&apos;s removed from Droid&apos;s copy, so Droid can&apos;t copy it.
          </p>
        </li>
        <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">2 · What Droid does</p>
          <ul className="list-disc space-y-1.5 pl-4 text-sm">
            <li>Works in a throwaway copy of the code, never the real project.</li>
            <li>
              Writes exactly one file, <code className="font-mono text-xs">generated/core.ts</code>: the{" "}
              <code className="font-mono">shop</code> commands.
            </li>
            <li>Every other edit and every shell command is blocked.</li>
          </ul>
        </li>
        <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">3 · What Perry checks before use</p>
          <ul className="space-y-1.5 text-sm">
            {gen.gates.map((g) => {
              const info = gateInfo[g.name];
              const status = g.skipped ? "skipped" : g.ok ? "passed" : "failed";
              return (
                <li key={g.name} className="flex gap-2">
                  <span
                    role="img"
                    aria-label={status}
                    className={`w-4 shrink-0 text-center ${
                      g.skipped ? "text-zinc-400" : g.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {g.skipped ? "–" : g.ok ? "✓" : "✗"}
                  </span>
                  <span>
                    {info?.name ?? g.name}
                    <span className="block text-xs text-zinc-500">{g.ok && !g.skipped ? (info?.why ?? g.detail) : g.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      </ol>

      <p
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          accepted
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        }`}
      >
        {accepted
          ? `✅ Passed all ${passed} checks, so agents use Droid's commands.`
          : `⛔ ${gen.status === "failed" ? "Generation failed" : "Turned away"}${gen.reason ? `: ${gen.reason}` : ""}. Agents keep using the last accepted commands.`}
        {accepted && measuredWith.length > 0 && (
          <span className="block text-xs font-normal">
            {measuredWith.includes("generated")
              ? "The comparison and the run above used these commands."
              : "The comparison above used our hand-written reference version, not these."}
          </span>
        )}
      </p>

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">Check details</summary>
        <ul className="mt-2 space-y-1">
          {gen.gates.map((g) => (
            <li key={g.name}>
              <span className="font-medium">{gateInfo[g.name]?.name ?? g.name}:</span> {g.detail}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Generated {age(gen.createdAt, now)}
          {gen.droidSessionId && (
            <>
              {" "}
              · Droid session <code className="font-mono">{gen.droidSessionId}</code>
            </>
          )}{" "}
          · <code className="font-mono">{gen.file.replace("data/results/", "")}</code>
        </p>
      </details>
    </div>
  );
}
