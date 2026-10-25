import type { AgentTrace, BenchmarkResult, TraceStep } from "@agentfix/shared";

import { liveWorktree } from "@/lib/child-process";
import {
  type InterfaceGen,
  type OutsideAgentCheck,
  type Window,
  agentGuide,
  demoStart,
  latestInterfaceGen,
  latestInterfaceResult,
  latestOutsideAgent,
  latestThreeWay,
} from "@/lib/interface";
import { type RunAverages, averages, change, usd, whole } from "@/lib/metrics";

import { LiveAction } from "./live-actions";
import { age } from "./patch-panel";
import { StateMark } from "./icons";
import { TimingTower, TowerStatus } from "./timing-tower";
import { Card } from "./ui";

/** This demo session (since `npm run reset:demo`) and the time before it, for backups. */
async function windows(): Promise<{ session: Window; earlier: Window | null }> {
  const since = await demoStart();
  return { session: { since }, earlier: since ? { before: since } : null };
}

/** The newest successful agent run on the shop commands in a window, from either kind of saved result. */
async function commandRun(w: Window | null) {
  if (!w) return null;
  const [three, only] = await Promise.all([
    latestThreeWay(w),
    latestInterfaceResult(w),
  ]);
  const pick = [
    three && {
      runs: three.result.agentInterface?.runs ?? [],
      file: three.file,
      result: three.result,
    },
    only && {
      runs: only.result.baseline.runs,
      file: only.file,
      result: only.result,
    },
  ]
    .filter((x) => !!x)
    .sort((a, b) =>
      String(b.result.createdAt).localeCompare(String(a.result.createdAt)),
    )[0];
  const trace =
    pick && (pick.runs.find((r) => r.outcome.success) ?? pick.runs[0]);
  return pick && trace ? { trace, file: pick.file, result: pick.result } : null;
}

/** A folded copy of the last result recorded before this demo session. */
function Backup({
  what,
  children,
}: {
  what: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700">
      <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
        Show the last recorded {what}{" "}
        <span className="text-xs text-zinc-500">
          (from before this demo session, a backup)
        </span>
      </summary>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  );
}

/**
 * Feature 2: Droid writes `shop` commands that agents use directly, Perry
 * checks them, one run in plain words, and any agent through MCP.
 * Renders nothing until there is something to show.
 */
export async function CommandsSection({ now }: { now: number }) {
  const { session, earlier } = await windows();
  const [
    recorded,
    guide,
    generated,
    backupGen,
    run,
    backupRun,
    outside,
    backupOutside,
  ] = await Promise.all([
    latestThreeWay(),
    agentGuide(),
    latestInterfaceGen(session),
    earlier ? latestInterfaceGen(earlier) : null,
    commandRun(session),
    commandRun(earlier),
    latestOutsideAgent(session),
    earlier ? latestOutsideAgent(earlier) : null,
  ]);

  return (
    <div className="space-y-6">
      <WhyItWorks result={recorded?.result ?? null} outside={outside} backupOutside={backupOutside} now={now} />

      <HowDroidBuildsIt gen={generated} backup={backupGen} backupRun={backupRun} now={now} />
      {/* Appears once Droid's commands pass in this demo session (always, before the first reset). */}
      {(generated?.status === "accepted" || !earlier) && <RunStory run={run} now={now} />}

      {guide && (
        <details className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer text-sm font-semibold">
            What the agent is told first
            <span className="ml-2 text-xs font-normal text-zinc-500">
              the short guide in its first message
            </span>
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-zinc-500">
              Generated from the store&apos;s catalog{" "}
              {age(guide.generatedAt, now)}, with a real example search. Agents
              in Perry&apos;s own tests run the commands in a sandbox: one bash
              tool, no files, no network, nothing but{" "}
              <code className="font-mono">shop</code>.
            </p>
            <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100">
              {guide.guide}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Why going straight to the catalog works

function Flow({ steps, tone }: { steps: string[]; tone: string }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="text-zinc-400">
              →
            </span>
          )}
          <span className={`rounded-md px-2 py-1 ${tone}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Browsing vs. commands, side by side, with the recorded averages when there are some. */
function WhyItWorks({
  result,
  outside,
  backupOutside,
  now,
}: {
  result: BenchmarkResult | null;
  outside: OutsideAgentCheck | null;
  backupOutside: OutsideAgentCheck | null;
  now: number;
}) {
  const browse = result?.patched
    ? averages(result.patched.runs)
    : result
      ? averages(result.baseline.runs)
      : null;
  const original = result ? averages(result.baseline.runs) : null;
  const commands = result?.agentInterface
    ? averages(result.agentInterface.runs)
    : null;
  const pageCount = (a: RunAverages) =>
    `${a.steps.toFixed(1)} steps · ${whole(a.tokens)} tokens`;
  return (
    <Card>
      <h3 className="font-semibold">
        Why this works, and how any agent can use it
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm font-medium">
            Browsing the website (even after Feature 1)
          </p>
          <Flow
            steps={[
              "Catalog",
              "drawn as web pages",
              "agent reads each page",
              "clicks to the next",
            ]}
            tone="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Every page is a long block of text and layout meant for eyes. The
            agent reads all of it, every step, to pull back out the few facts it
            needs.
          </p>
          {original && browse && (
            <p className="text-xs text-zinc-500 tabular-nums">
              In the last recorded comparison: {pageCount(original)} on the
              original website; {pageCount(browse)} on the fixed one.
            </p>
          )}
        </div>
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
          <p className="text-sm font-medium">Shop commands (Feature 2)</p>
          <Flow
            steps={["Catalog", "one search with every filter", "exact answer"]}
            tone="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            The agent asks for exactly what the task needs and gets back only
            the matching items, a few lines long. Then one command adds the
            right one to the real cart.
          </p>
          {commands && (
            <p className="text-xs text-zinc-500 tabular-nums">
              In the last recorded comparison: {pageCount(commands)}.
            </p>
          )}
        </div>
      </div>
      <ul className="grid gap-3 text-sm md:grid-cols-3">
        <li className="space-y-1">
          <p className="font-medium">Exact</p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Answers come straight from the catalog at that moment, so prices,
            sizes and stock can&apos;t be misread or out of date. Sold out says
            sold out.
          </p>
        </li>
        <li className="space-y-1">
          <p className="font-medium">Small</p>
          <p className="text-zinc-600 dark:text-zinc-400">
            The agent reads a few lines instead of whole pages. Model cost grows
            with what the agent reads, so less text means a cheaper purchase.
          </p>
        </li>
        <li className="space-y-1">
          <p className="font-medium">Fewer steps</p>
          <p className="text-zinc-600 dark:text-zinc-400">
            One search with every filter replaces opening product pages one by
            one, so the purchase is faster too.
          </p>
        </li>
      </ul>
      <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-300">
        <span className="font-medium">Why it works for any store:</span> every
        store has a catalog and a cart, but each keeps them differently. So
        Droid reads the store&apos;s own code and writes the bridge, while
        Perry&apos;s written standard keeps the commands the same everywhere, so
        any agent already knows how to use them.
      </p>
      <AnyAgent outside={outside} backup={backupOutside} now={now} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// How Droid builds the commands

/** Perry's gates on Droid's code (packages/optimizer/generate-interface.ts), in plain words. */
const gateInfo: Record<string, { name: string; why: string }> = {
  allowlist: {
    name: "Changed only its one file",
    why: "It can't touch prices, stock, the cart or the checks themselves.",
  },
  independence: {
    name: "Wrote its own code",
    why: "No imports from our reference version and no copied blocks.",
  },
  typecheck: {
    name: "Compiles",
    why: "The whole project still builds with Droid's file in it.",
  },
  "contract tests": {
    name: "Every answer matches the catalog",
    why: "18 tests, including 5,184 search combinations: nothing wrong returned, nothing missed.",
  },
  integration: {
    name: "A real purchase verifies",
    why: "It put the right shoe in the real store's cart, and refused sold-out and duplicate adds.",
  },
};

const reads = [
  {
    what: "The product catalog",
    note: "every product, price, size and stock level",
    file: "apps/storefront/lib/catalog.ts",
  },
  {
    what: "The cart API",
    note: "how to read the cart and add to it",
    file: "apps/storefront/app/api/cart/route.ts",
  },
  {
    what: "Perry's standard for shop commands",
    note: "which commands, and their exact output",
    file: "packages/agent-interface/CONTRACT.md",
  },
];

function HowDroidBuildsIt({
  gen,
  backup,
  backupRun,
  now,
}: {
  gen: InterfaceGen | null;
  backup: InterfaceGen | null;
  backupRun: CommandRun | null;
  now: number;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Try it: Droid builds the commands</h3>
        {gen && (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {gen.provenance === "fixture"
              ? "Scripted test, not Droid"
              : `Droid run ${age(gen.createdAt, now)}`}
          </span>
        )}
      </div>
      <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        No one hand-writes commands for a store. Droid writes them from the
        store&apos;s code, and Perry lets agents use them only after they pass
        every check. The same steps work for any store.
      </p>
      <ol className="grid gap-3 lg:grid-cols-3">
        <Step n={1} title="Droid reads the store">
          <ul className="space-y-2">
            {reads.map((r) => (
              <li key={r.file}>
                <span className="font-medium">{r.what}</span>: {r.note}
                <code className="block font-mono text-[11px] text-zinc-500">
                  {r.file}
                </code>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            Our own reference version is removed from Droid&apos;s copy, so it
            can&apos;t peek or copy.
          </p>
        </Step>
        <Step n={2} title="Droid writes one file">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              It works in a throwaway copy of the code, never the real project.
            </li>
            <li>
              It may write exactly one file,{" "}
              <code className="font-mono text-xs">generated/core.ts</code>: the
              commands.
            </li>
            <li>Any other edit, and every shell command, is blocked.</li>
          </ul>
        </Step>
        <Step n={3} title="Perry checks it before any agent uses it">
          <Gates gen={gen} />
        </Step>
      </ol>

      <LiveAction kind="generate" />
      {gen ? (
        <GenResult gen={gen} />
      ) : (
        <p className="text-sm text-zinc-500">
          Not generated yet in this demo session.
        </p>
      )}

      {!gen && backup && (
        <Backup what="Droid run">
          <Gates gen={backup} />
          <GenResult gen={backup} />
          <p className="text-xs text-zinc-500">
            Recorded {age(backup.createdAt, now)}.
          </p>
          {backupRun && (
            <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <p className="font-medium">The agent shopping with recorded commands</p>
              <RunBody {...backupRun} now={now} />
            </div>
          )}
        </Backup>
      )}
    </Card>
  );
}

/** The five checks: results when Droid has run, otherwise what will be checked. */
function Gates({ gen }: { gen: InterfaceGen | null }) {
  const gates =
    gen?.gates ??
    Object.keys(gateInfo).map((name) => ({
      name,
      ok: false,
      skipped: true,
      detail: "",
      pending: true,
    }));
  return (
    <ul className="space-y-2">
      {gates.map((g) => {
        const info = gateInfo[g.name];
        const pending = "pending" in g;
        return (
          <li key={g.name} className="flex gap-2">
            <span className="mt-0.5">
              <StateMark state={pending ? "pending" : g.skipped ? "skipped" : g.ok ? "done" : "failed"} />
            </span>
            <span>
              {info?.name ?? g.name}
              <span className="block text-xs text-zinc-500">
                {pending || (g.ok && !g.skipped)
                  ? (info?.why ?? g.detail)
                  : g.detail}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function GenResult({ gen }: { gen: InterfaceGen }) {
  const accepted = gen.status === "accepted";
  const passed = gen.gates.filter((g) => g.ok && !g.skipped).length;
  return (
    <>
      <p
        className={`rounded-lg px-3 py-2 text-sm font-medium ${
          accepted
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        }`}
      >
        {accepted
          ? `Passed all ${passed} checks, so these are the commands agents use.`
          : `${gen.status === "failed" ? "Generation failed" : "Turned away"}${gen.reason ? `: ${gen.reason}` : ""}. Agents keep using the last accepted commands.`}
      </p>
      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">Technical details</summary>
        <ul className="mt-2 space-y-1">
          {gen.gates.map((g) => (
            <li key={g.name}>
              <span className="font-medium">
                {gateInfo[g.name]?.name ?? g.name}:
              </span>{" "}
              {g.detail}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          {gen.droidSessionId && (
            <>
              Droid session{" "}
              <code className="font-mono">{gen.droidSessionId}</code> ·{" "}
            </>
          )}
          <code className="font-mono">
            {gen.file.replace("data/results/", "")}
          </code>
        </p>
      </details>
    </>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="space-y-2 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-950/40">
      <p className="flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white dark:bg-blue-500"
        >
          {n}
        </span>
        {title}
      </p>
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------
// One run, in plain words

interface Row {
  sku: string;
  name: string;
  color: string;
  category: string;
  price: string;
  size: string;
  stock: string;
}

/** Splits `shop search` text output (CONTRACT.md) into rows and near misses. */
function parseSearch(out: string) {
  const lines = out.trimEnd().split("\n");
  const missAt = lines.indexOf("Near misses:");
  const rows: Row[] = lines
    .slice(1, missAt === -1 ? undefined : missAt)
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 7)
    .map(([sku, name, color, category, price, size, stock]) => ({
      sku: sku!,
      name: name!,
      color: color!,
      category: category!,
      price: price!,
      size: size!.replace("size ", ""),
      stock: stock!,
    }));
  const misses =
    missAt === -1
      ? []
      : lines.slice(missAt + 1).flatMap((l) => {
          const m = /^\s+(.+?): (.+)$/.exec(l);
          return m ? [{ name: m[1]!, reason: m[2]! }] : [];
        });
  return { rows, misses };
}

/** The filters of a `shop search` command as short labels. */
function searchFilters(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const [flag = "", inline] = args[i]!.split("=", 2);
    const value = () => inline ?? args[++i] ?? "";
    if (flag === "--color" || flag === "--category") out.push(value());
    else if (flag === "--max-price") out.push(`up to $${value()}`);
    else if (flag === "--min-price") out.push(`from $${value()}`);
    else if (flag === "--size") out.push(`size ${value()}`);
    else if (flag === "--in-stock") out.push("in stock");
    else if (flag === "--limit") value();
    else if (!flag.startsWith("-")) out.push(`“${flag}”`);
  }
  return out;
}

function cartLine(out: string): string | null {
  const json = out.split("\n").find((l) => l.startsWith("{"));
  if (!json) return null;
  try {
    const cart = JSON.parse(json) as { totalUsd: number; items: unknown[] };
    return `Cart: ${cart.items.length} item${cart.items.length === 1 ? "" : "s"}, $${cart.totalUsd} total`;
  } catch {
    return null;
  }
}

/** One command, described for someone who has never seen a terminal. */
function Action({ step, n }: { step: TraceStep; n: number }) {
  const cmd = step.command ?? step.target ?? "";
  const args = cmd.trim().split(/\s+/).slice(1);
  const out = step.output ?? "";
  const failed = !step.ok;

  let title: React.ReactNode = <code className="font-mono text-xs">{cmd}</code>;
  let body: React.ReactNode = null;
  if (args[0] === "search" && !failed) {
    const { rows, misses } = parseSearch(out);
    const filters = searchFilters(args);
    title = "Searched the store";
    body = (
      <div className="space-y-3">
        {filters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <span
                key={f}
                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
              >
                {f}
              </span>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {rows.length === 0
              ? "No product fits every filter"
              : `${rows.length} fits every filter`}
          </p>
          {rows.map((r) => (
            <div
              key={r.sku}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30"
            >
              <span className="font-medium">{r.name}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {r.color} {r.category} · size {r.size} ·{" "}
                {r.stock === "sold out"
                  ? "sold out"
                  : `${r.stock.replace("stock ", "")} in stock`}
              </span>
              <span className="ml-auto font-medium tabular-nums">
                {r.price}
              </span>
            </div>
          ))}
        </div>
        {misses.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Close, but ruled out
            </p>
            <ul className="space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              {misses.map((m) => (
                <li key={m.name}>
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {m.name}
                  </span>
                  : {m.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else if (args[0] === "cart" && args[1] === "add") {
    const added = /^Added \S+ \((.+), size (\d+)\)\./.exec(out);
    title = failed
      ? "Tried to add to the cart"
      : added
        ? `Added ${added[1]}, size ${added[2]}, to the cart`
        : "Added to the cart";
    const line = cartLine(out);
    body =
      !failed && line ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{line}</p>
      ) : null;
  } else if (args[0] === "cart" && args[1] === "show") {
    const line = cartLine(out);
    title = "Checked the cart";
    body = line ? (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{line}</p>
    ) : null;
  } else if (args[0] === "checkout") {
    title = "Previewed checkout (no order is placed)";
  } else if (args[0] === "product") {
    title = `Looked up ${args[1] ?? "a product"}`;
  }

  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          failed
            ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
            : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        }`}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">{title}</p>
        {failed && (
          <p className="text-sm text-red-700 dark:text-red-400">
            The store refused: {(step.error ?? out).trim()}
          </p>
        )}
        {body}
      </div>
    </li>
  );
}

type CommandRun = { trace: AgentTrace; file: string; result: BenchmarkResult };

function RunStory({ run, now }: { run: CommandRun | null; now: number }) {
  return (
    <Card>
      <div className="space-y-1">
        <h3 className="font-semibold">Try it: watch the agent shop with Droid&apos;s commands</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The same agent and task as Step 1, using the commands instead of the website.
        </p>
      </div>
      <LiveAction kind="try" />
      {run ? <RunBody {...run} now={now} /> : <p className="text-sm text-zinc-500">No run yet in this demo session.</p>}
    </Card>
  );
}

function RunBody({ trace, file, result, now }: CommandRun & { now: number }) {
  const actions = trace.steps.filter((s) => s.action === "shell");
  const done = trace.steps.find((s) => s.action === "done");
  const { outcome, metrics } = trace;
  return (
    <div className="space-y-4">
      <div>
        {result.provenance === "fixture" ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            Sample data, not a real run
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Real run, {age(trace.startedAt, now)}
          </span>
        )}
      </div>

      <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-950/40">
        <span className="text-zinc-500">Task: </span>
        {trace.task}
      </div>

      <ol className="space-y-4">
        {actions.map((s, i) => (
          <Action key={s.index} step={s} n={i + 1} />
        ))}
      </ol>

      {done?.target && (
        <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
          <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            The agent&apos;s answer
          </span>
          {done.target}
        </blockquote>
      )}

      <p
        className={`rounded-lg px-3 py-2 text-sm font-medium ${
          outcome.success
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        }`}
      >
        {outcome.success
          ? "Perry checked the store's real cart: exactly the right shoe."
          : "Perry checked the store's real cart: not the right purchase."}{" "}
        <span className="font-normal">
          {outcome.cart.length === 0
            ? "Cart empty"
            : outcome.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ")}
          {!outcome.success && outcome.reason ? ` · ${outcome.reason}` : ""}
        </span>
      </p>
      <p className="text-xs text-zinc-500 tabular-nums">
        {actions.length} command{actions.length === 1 ? "" : "s"} ·{" "}
        {(metrics.totalMs / 1000).toFixed(1)}s ·{" "}
        {whole(metrics.inputTokens + metrics.outputTokens)} tokens · $
        {metrics.estimatedCostUsd.toFixed(5)} · run{" "}
        <code className="font-mono">{trace.runId}</code> from{" "}
        <code className="font-mono">{file.replace("data/results/", "")}</code>
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
          Show the exact commands and output
        </summary>
        <ol className="mt-3 space-y-2">
          {actions.map((s) => (
            <li
              key={s.index}
              className="rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100"
            >
              <span className="whitespace-pre-wrap break-all">
                {!s.ok && <span className="text-red-400">✗ </span>}${" "}
                {s.command ?? s.target ?? ""}
              </span>
              {s.output && (
                <pre className="mt-1 whitespace-pre-wrap break-all text-zinc-300">
                  {s.output}
                </pre>
              )}
              {!s.ok && s.error && (
                <p className="mt-1 text-red-400">{s.error}</p>
              )}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Any agent, through MCP

const tools = [
  {
    name: "search",
    what: "Find products by color, category, price, size and stock",
  },
  { name: "product", what: "Every size of one product, with stock" },
  {
    name: "cart_add",
    what: "Add one item to the real cart (refuses sold-out, unknown or duplicate items)",
  },
  { name: "cart_show", what: "What's in the cart, and its cart ID" },
  {
    name: "checkout_preview",
    what: "What would be ordered. It never places an order",
  },
];

const implName = (i?: string) =>
  i === "generated"
    ? "Droid's commands"
    : i === "handwritten"
      ? "our reference commands"
      : null;

function OutsideCard({
  outside,
  now,
}: {
  outside: OutsideAgentCheck;
  now: number;
}) {
  return (
    <div
      className={`space-y-1 rounded-lg border p-3 text-sm ${
        outside.success
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      }`}
    >
      <p className="font-medium">
        {outside.client}{" "}
        {outside.success
          ? "put the right shoe in the cart"
          : "didn't make the right purchase"}
      </p>
      <p className="text-zinc-700 dark:text-zinc-300">
        Perry read the store&apos;s real cart afterwards:{" "}
        {outside.cart.length === 0
          ? "empty"
          : outside.cart.map((i) => `${i.sku} × ${i.quantity}`).join(", ")}
        {outside.success
          ? `, exactly the expected ${outside.expectedSku}.`
          : outside.reason
            ? ` (${outside.reason}).`
            : "."}
      </p>
      <p className="text-xs text-zinc-500">
        Recorded {age(outside.createdAt, now)}
        {implName(outside.implementation) && (
          <> · using {implName(outside.implementation)}</>
        )}{" "}
        · cart <code className="font-mono">{outside.cartId.slice(0, 8)}</code>
      </p>
    </div>
  );
}

function AnyAgent({
  outside,
  backup,
  now,
}: {
  outside: OutsideAgentCheck | null;
  backup: OutsideAgentCheck | null;
  now: number;
}) {
  return (
    <div className="space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <h4 className="font-medium">How any AI agent uses them: MCP</h4>
      <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        MCP (Model Context Protocol) is the open standard AI apps use to plug in
        tools. Perry serves the same commands as an MCP server called{" "}
        <code className="font-mono">perry-shop</code>, so Claude Desktop, Claude
        Code or any other MCP client can shop the store with no browser, after
        adding one config entry. Agents can fill a cart; placing the order stays
        with a person.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            The tools an agent gets
          </p>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {tools.map((t) => (
              <li key={t.name} className="flex gap-3 px-3 py-2">
                <code className="w-32 shrink-0 font-mono text-xs leading-5 text-blue-700 dark:text-blue-400">
                  {t.name}
                </code>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {t.what}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Tried by an outside agent
          </p>
          {outside ? (
            <OutsideCard outside={outside} now={now} />
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              Not tried yet in this demo session. Ask Claude Desktop (with
              perry-shop) to buy the shoe, then run{" "}
              <code className="font-mono text-xs">
                npm run verify-cart -w @agentfix/agent-interface -- &lt;cart
                id&gt; --save --client &quot;Claude Desktop&quot;
              </code>
            </p>
          )}
          {!outside && backup && (
            <Backup what="outside-agent purchase">
              <OutsideCard outside={backup} now={now} />
            </Backup>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
              Connect your own agent
            </summary>
            <div className="mt-2 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              <p>
                Add this to Claude Desktop&apos;s{" "}
                <code className="font-mono">claude_desktop_config.json</code>{" "}
                (or any MCP client&apos;s config), restart it, and ask it to buy
                something:
              </p>
              <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 font-mono text-zinc-100">{`"mcpServers": {
  "perry-shop": {
    "command": "node",
    "args": ["<repo>/packages/agent-interface/scripts/mcp.ts"],
    "env": { "STORE_URL": "http://localhost:3001" }
  }
}`}</pre>
              <p>
                Then check its purchase against the real cart:{" "}
                <code className="font-mono">
                  npm run verify-cart -w @agentfix/agent-interface -- &lt;cart
                  id&gt;
                </code>
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results: the same agent, three ways in

const verdictTone = {
  improved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  no_change: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  regressed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
} as const;

const implLabel = (i: string) =>
  i === "generated"
    ? "generated by Droid"
    : i === "handwritten"
      ? "hand-written reference"
      : i;

/**
 * The comparison at the end of the page. Empty until it's run in this demo
 * session (after a Feature 1 fix is live and Feature 2's commands exist).
 */
export async function ResultsSection({
  baseline,
  now,
}: {
  baseline: RunAverages | null;
  now: number;
}) {
  const { session, earlier } = await windows();
  const [current, backup, live, gen] = await Promise.all([
    latestThreeWay(session),
    earlier ? latestThreeWay(earlier) : null,
    liveWorktree(),
    latestInterfaceGen(session),
  ]);
  const fixLive = live !== undefined;
  const commandsReady = gen?.status === "accepted" || !earlier;
  const missing = [
    !fixLive && "make a Feature 1 fix live",
    !commandsReady && "generate the Feature 2 commands",
  ].filter((m): m is string => typeof m === "string");
  const checklist = [
    {
      done: fixLive,
      text: "Feature 1: a Droid fix is live on the fixed store (localhost:3002)",
    },
    {
      done: commandsReady,
      text: "Feature 2: Droid's commands passed every check",
    },
    {
      done: !!current,
      text: "Run the comparison: the same agent, 5 times each way",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <ol className="space-y-1.5 text-sm">
          {checklist.map((c) => (
            <li key={c.text} className="flex gap-2">
              <StateMark state={c.done ? "done" : "pending"} />
              {c.text}
            </li>
          ))}
        </ol>
        <LiveAction
          kind="compare"
          disabledReason={
            missing.length > 0 ? `First ${missing.join(" and ")}.` : undefined
          }
        />
        {current ? (
          <Comparison
            result={current.result}
            file={current.file}
            baseline={baseline}
            session
            now={now}
          />
        ) : (
          <p className="text-sm text-zinc-500">
            Not compared yet in this demo session.
          </p>
        )}
        {!current && backup && (
          <Backup what="comparison">
            <Comparison
              result={backup.result}
              file={backup.file}
              baseline={baseline}
              session={false}
              now={now}
            />
          </Backup>
        )}
      </Card>
    </div>
  );
}

function Comparison({
  result,
  file,
  baseline,
  session,
  now,
}: {
  result: BenchmarkResult;
  file: string;
  baseline: RunAverages | null;
  session: boolean;
  now: number;
}) {
  const rows: {
    label: string;
    sub: string;
    a: RunAverages;
    verdict?: BenchmarkResult["verdict"];
  }[] = [
    {
      label: "Original website",
      sub: "Step 1: browsing, no changes",
      a: averages(result.baseline.runs),
    },
    ...(result.patched
      ? [
          {
            label: "Fixed website",
            sub: "Feature 1: browsing after Droid's fix",
            a: averages(result.patched.runs),
            verdict: result.verdict,
          },
        ]
      : []),
    ...(result.agentInterface
      ? [
          {
            label: "Shop commands",
            sub: "Feature 2: commands Droid wrote",
            a: averages(result.agentInterface.runs),
            verdict: result.agentInterfaceVerdict,
          },
        ]
      : []),
  ];
  const original = rows[0]!.a;
  const commands = result.agentInterface ? rows[rows.length - 1]!.a : null;
  const saving =
    commands && original.costPerPurchase && commands.costPerPurchase !== null
      ? Math.round(
          (1 - commands.costPerPurchase / original.costPerPurchase) * 100,
        )
      : null;
  const impl = [
    ...new Set(
      (result.agentInterface?.runs ?? []).flatMap((r) =>
        r.meta?.interfaceImpl ? [r.meta.interfaceImpl] : [],
      ),
    ),
  ];

  return (
    <div className="space-y-4">
      <TimingTower
        entries={rows.map((r, i) => ({ label: r.label, sub: r.sub, a: r.a, baseline: i === 0 }))}
        status={<TowerStatus session={session} />}
      />
      {commands && saving !== null && (
        <p className="text-lg text-balance">
          With shop commands, the same purchase cost <span className="font-semibold">{saving}% less</span> than on the
          original website, in {commands.steps.toFixed(0)} steps instead of {original.steps.toFixed(1)} and{" "}
          {commands.seconds.toFixed(1)}s instead of {original.seconds.toFixed(1)}s.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="py-2 pr-3 font-medium">Way in</th>
              <th className="px-3 py-2 font-medium">
                Cost per verified purchase
              </th>
              <th className="px-3 py-2 text-right font-medium">Steps</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Time</th>
              <th className="py-2 pl-3 text-right font-medium">Verified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.label}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
              >
                <td className="py-3 pr-3">
                  <span className="font-medium">{r.label}</span>
                  <span className="block text-xs text-zinc-500">{r.sub}</span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-20 font-mono font-medium tabular-nums">
                      {usd(r.a.costPerPurchase)}
                    </span>
                    <span className="w-14">
                      {i > 0 &&
                        original.costPerPurchase !== null &&
                        r.a.costPerPurchase !== null && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${verdictTone[r.verdict ?? "no_change"]}`}
                          >
                            {change(
                              original.costPerPurchase,
                              r.a.costPerPurchase,
                            )}
                          </span>
                        )}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.a.steps.toFixed(1)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {whole(r.a.tokens)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.a.seconds.toFixed(1)}s
                </td>
                <td className="py-3 pl-3 text-right tabular-nums">
                  {r.a.verified} / {r.a.runs}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {baseline && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          For reference, Step 1&apos;s {baseline.runs} runs on the original
          website averaged {baseline.steps.toFixed(1)} steps,{" "}
          {whole(baseline.tokens)} tokens and {usd(baseline.costPerPurchase)}{" "}
          per verified purchase. The first row measures the original website
          again, alongside the other two.
        </p>
      )}

      <div className="grid gap-3 text-sm md:grid-cols-2">
        <p className="rounded-lg bg-violet-50 p-3 text-violet-950 dark:bg-violet-950/30 dark:text-violet-200">
          <span className="font-semibold">Feature 1</span> helps every agent
          that browses, such as ChatGPT&apos;s agent or Claude in Chrome. Many
          agents can only browse, so the website has to work for them.
        </p>
        <p className="rounded-lg bg-blue-50 p-3 text-blue-950 dark:bg-blue-950/30 dark:text-blue-200">
          <span className="font-semibold">Feature 2</span> gives agents that use
          tools a much cheaper way in, through MCP, without changing the
          website.
        </p>
      </div>

      <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        {result.provenance === "fixture" ? (
          <strong className="text-amber-800 dark:text-amber-300">
            Sample data, not a real run.
          </strong>
        ) : (
          <>Real agent runs, recorded {age(result.createdAt, now)}.</>
        )}{" "}
        Model <code className="font-mono">{result.model}</code>. Steps are
        browser actions on the websites and commands with shop. Averages over
        every run; cost is the total model cost divided by verified purchases.{" "}
        {impl.length > 0 && (
          <>Shop commands: {impl.map(implLabel).join(" and ")}. </>
        )}
        <code className="font-mono">{file.replace("data/results/", "")}</code>
      </p>
    </div>
  );
}
