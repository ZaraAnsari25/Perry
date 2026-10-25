import type { VariantSummary } from "@agentfix/shared";
import Link from "next/link";

import type { Measurement, SavedPatch } from "@/lib/results";

import { MakeLiveButton } from "./make-live-button";
import { MeasureButton } from "./measure-button";

const tone = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  neutral: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

/**
 * What a fix has shown so far. Passing the checks proves a fix is safe, not
 * that it helps; only a measurement (same agent on both stores) shows that.
 */
function fixState(patch: SavedPatch): { label: string; tone: keyof typeof tone; sentence: string } {
  if (patch.status === "rejected") {
    return { label: "Rejected", tone: "bad", sentence: "Rejected: the fix failed a check, so it was not used." };
  }
  if (patch.status === "failed") {
    return { label: "Failed", tone: "neutral", sentence: "Droid did not finish, so there is no fix to check." };
  }
  const m = patch.measurements[0]?.result;
  if (!m?.patched) {
    return {
      label: "Safe · not measured yet",
      tone: "pending",
      sentence: "Passed every safety check. Measure it to find out whether it actually helps the shopping agent.",
    };
  }
  if (m.verdict === "improved") {
    const pct = (before: number, after: number) => Math.round((1 - after / before) * 100);
    const cost =
      m.baseline.costPerVerifiedSuccessUsd && m.patched.costPerVerifiedSuccessUsd
        ? `, ${pct(m.baseline.costPerVerifiedSuccessUsd, m.patched.costPerVerifiedSuccessUsd)}% cheaper per verified purchase`
        : "";
    return {
      label: "Improved",
      tone: "good",
      sentence: `Safe, and measured to help: ${pct(m.baseline.avgToolCalls, m.patched.avgToolCalls)}% fewer steps${cost}.`,
    };
  }
  if (m.verdict === "regressed") {
    return {
      label: "Safe · made it worse",
      tone: "bad",
      sentence: "Safe, but the shopping agent did worse with it. Don't keep it.",
    };
  }
  return {
    label: "Safe · didn't clearly help",
    tone: "neutral",
    sentence: "Safe, but measuring showed no clear improvement for the shopping agent.",
  };
}

// The three gates, in plain words. The keys match PatchResult.checks.
const gates = [
  { key: "allowlist", label: "Only allowed files changed", detail: "The search card and search code; never prices or stock" },
  { key: "build", label: "Builds successfully", detail: "The fixed store compiles and runs" },
  { key: "tests", label: "Prices and stock still correct", detail: "Every search card matches the catalog" },
] as const;

/** Who produced the patch. Simulated patches are scripted tests, never shown as Droid's. */
export function source(patch: SavedPatch): string {
  if (patch.hostile) return `Simulated hostile patch "${patch.hostile}" (scripted test, not Droid)`;
  if (patch.redTeam) return "Factory Droid, given a red-team prompt asking for a forbidden change";
  return "Factory Droid";
}

/** "just now", "12 minutes ago", or a date, relative to when the page was rendered. */
export function age(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes)) return "at an unknown time";
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  return `on ${new Date(iso).toLocaleString("en-US")}`;
}

/** Fixes generated from the run being viewed, newest first. */
export function PatchPanel({
  patches,
  live,
  now,
}: {
  patches: SavedPatch[];
  /** Worktree the fixed store on localhost:3002 is serving, if any. */
  live?: string;
  now: number;
}) {
  const [latest, ...earlier] = patches;
  return (
    <section aria-labelledby="patch-heading" className="space-y-3">
      <h3 id="patch-heading" className="font-semibold">
        Droid&apos;s fix for the selected run
      </h3>
      {latest ? <PatchCard patch={latest} now={now} live={live} /> : <NoPatch />}
      {earlier.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Earlier fixes for this run</h3>
          <ul className="space-y-2">
            {earlier.map((p) => (
              <li key={p.file}>
                <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <FixBadge patch={p} />
                    <span>{source(p)}</span>
                    <span className="text-xs text-zinc-500">generated {age(p.createdAt, now)}</span>
                    {live !== undefined && p.worktreePath === live && <LiveBadge />}
                  </summary>
                  <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                    <PatchCard patch={p} now={now} live={live} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * A blocked request in plain words. Mirrors describeBlocked in
 * packages/optimizer, which the dashboard doesn't import (it would bundle the
 * Droid SDK into the site).
 */
function describeBlocked(entry: string): string {
  const outside = entry.split(", ").filter((p) => p.startsWith("../") || p.startsWith("/"));
  if (outside.length > 0) return `An edit to a path outside its sandbox, usually a mistyped path: ${outside.join(", ")}`;
  if (/^[a-z_]+$/.test(entry)) return entry === "exec" ? "A shell command, which Droid may not run" : `A "${entry}" action, which Droid may not run`;
  return `An edit to ${entry}, which is not one of the files it may change`;
}

export function FixBadge({ patch }: { patch: SavedPatch }) {
  const state = fixState(patch);
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[state.tone]}`}>{state.label}</span>;
}

function NoPatch() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      No fix yet for this run. Click <strong>Optimize with Factory Droid</strong> above; the result
      appears here.
    </div>
  );
}

export function LiveBadge() {
  return (
    <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-emerald-500 dark:text-emerald-950">
      Live on localhost:3002
    </span>
  );
}

export function PatchCard({
  patch,
  now,
  live,
  replay = false,
}: {
  patch: SavedPatch;
  now: number;
  live?: string;
  replay?: boolean;
}) {
  const isLive = live !== undefined && patch.worktreePath === live;
  return (
    <article className="space-y-5 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <FixBadge patch={patch} />
          {replay && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              Replay of an earlier run
            </span>
          )}
          {isLive && <LiveBadge />}
          <span className="text-xs text-zinc-500">
            {source(patch)} · generated {age(patch.createdAt, now)}
            {patch.attempt && patch.attempt > 1 ? ` · attempt ${patch.attempt}, told why the last one failed` : ""}
          </span>
        </div>
        <p className="text-base font-medium">{fixState(patch).sentence}</p>
      </header>

      {isLive ? (
        <p className="text-sm">
          The fixed store at{" "}
          <a
            href="http://localhost:3002/search?q=black+running+shoe"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-700 underline dark:text-blue-400"
          >
            localhost:3002
          </a>{" "}
          is running this fix.
        </p>
      ) : (
        <>
          {patch.servable && <MakeLiveButton file={patch.file} />}
          {!patch.servable && patch.status === "accepted" && patch.provenance === "live" && (
            <p className="text-xs text-zinc-500">
              This fix&apos;s built copy was removed (for example by a reset), so it can&apos;t be made live again.
            </p>
          )}
        </>
      )}

      {patch.status === "accepted" && patch.provenance === "live" && (
        <MeasurementSection patch={patch} isLive={isLive} now={now} />
      )}

      {patch.explanation && (
        <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm dark:border-zinc-700">
          <div className="text-xs font-medium text-zinc-500">
            {patch.provenance === "fixture" ? "What the simulated patch does" : "What Droid says it changed"}
          </div>
          {patch.explanation}
        </blockquote>
      )}

      {patch.preview && <CardPreview preview={patch.preview} />}

      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-500">Checks Perry ran before accepting the fix</p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {gates.map((g) => {
            const passed = patch.checks[g.key];
            return (
              <li key={g.key} className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className={passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                  >
                    {passed ? "✓" : "✗"}
                  </span>
                  {g.label}
                  <span className="sr-only">{passed ? "passed" : "not passed"}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">{g.detail}</div>
              </li>
            );
          })}
        </ul>
      </div>

      {patch.blocked.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <div className="font-medium text-amber-900 dark:text-amber-200">Perry blocked some of Droid&apos;s requests</div>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-950 dark:text-amber-100">
            {patch.blocked.map((b) => (
              <li key={b}>{describeBlocked(b)}</li>
            ))}
          </ul>
        </div>
      )}

      {patch.rejectionReason && (
        <div className="rounded-md bg-red-50 p-3 text-sm dark:bg-red-950/30">
          <div className="font-medium text-red-800 dark:text-red-300">Why it was not accepted</div>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-red-900 dark:text-red-200">
            {patch.rejectionReason}
          </pre>
        </div>
      )}

      <div className="space-y-2">
        {patch.diff && (
          <Expandable title="What changed in the code">
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
              {patch.diff.split("\n").map((line, i) => (
                <span
                  key={i}
                  className={
                    line.startsWith("+") && !line.startsWith("+++")
                      ? "block text-emerald-700 dark:text-emerald-400"
                      : line.startsWith("-") && !line.startsWith("---")
                        ? "block text-red-700 dark:text-red-400"
                        : "block"
                  }
                >
                  {line || " "}
                </span>
              ))}
            </pre>
          </Expandable>
        )}
        {patch.log && patch.log.length > 0 && (
          <Expandable
            title={`Everything Droid did (${patch.log.filter((l) => l.startsWith("[tool]")).length} actions)`}
          >
            <pre className="max-h-72 overflow-auto font-mono text-xs leading-relaxed">{patch.log.join("\n")}</pre>
          </Expandable>
        )}
        <Expandable title="Technical details">
          <dl className="grid gap-x-6 gap-y-1 text-xs text-zinc-600 sm:grid-cols-[max-content_1fr] dark:text-zinc-400">
            <dt className="font-medium">Factory Droid session</dt>
            <dd className="font-mono">{patch.toolRunId ?? "none"}</dd>
            <dt className="font-medium">Files changed</dt>
            <dd className="font-mono">{patch.filesChanged.join(", ") || "none"}</dd>
            <dt className="font-medium">Agent run it fixes</dt>
            <dd className="font-mono">{patch.traceRunId || "unknown"}</dd>
            <dt className="font-medium">Base commit</dt>
            <dd className="font-mono">{patch.baseCommit.slice(0, 7)}</dd>
            <dt className="font-medium">Sandbox copy</dt>
            <dd className="break-all font-mono">{patch.worktreePath || "none"}</dd>
            <dt className="font-medium">Saved result</dt>
            <dd className="font-mono">{patch.file}</dd>
          </dl>
        </Expandable>
      </div>
    </article>
  );
}

/** Does the fix help? The newest measurement of it, and the button to measure it. */
function MeasurementSection({ patch, isLive, now }: { patch: SavedPatch; isLive: boolean; now: number }) {
  const [latest, ...older] = patch.measurements;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500">Does this fix help the shopping agent?</p>
      {latest ? (
        <MeasurementResult measurement={latest} now={now} />
      ) : isLive ? null : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Not measured yet.{" "}
          {patch.servable
            ? "Make it live on localhost:3002, then measure it."
            : "Its built copy was removed, so it can't be measured."}
        </p>
      )}
      {isLive && <MeasureButton file={patch.file} />}
      {older.length > 0 && (
        <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
          <summary className="cursor-pointer px-3 py-2 text-sm">
            {older.length} earlier measurement{older.length === 1 ? "" : "s"} of this fix
          </summary>
          <div className="space-y-4 border-t border-zinc-200 p-3 dark:border-zinc-800">
            {older.map((m) => (
              <MeasurementResult key={m.file} measurement={m} now={now} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Relative change from before to after, e.g. "−41%". */
function change(before: number, after: number): string {
  if (before === 0) return "–";
  const pct = Math.round(((after - before) / before) * 100);
  return pct === 0 ? "no change" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

function MeasurementResult({ measurement, now }: { measurement: Measurement; now: number }) {
  const { result, file, source, note } = measurement;
  const before = result.baseline;
  const after = result.patched;
  if (!after) return null;
  const tokens = (v: VariantSummary) => Math.round(v.avgInputTokens + v.avgOutputTokens);
  const cost = (v: VariantSummary) =>
    v.costPerVerifiedSuccessUsd === null ? "no successes" : `$${v.costPerVerifiedSuccessUsd.toFixed(5)}`;
  const rows: { label: string; before: string; after: string; change: string }[] = [
    {
      label: "Verified success",
      before: `${Math.round(before.completionRate * 100)}%`,
      after: `${Math.round(after.completionRate * 100)}%`,
      change: change(before.completionRate, after.completionRate),
    },
    {
      label: "Steps (tool calls)",
      before: before.avgToolCalls.toFixed(1),
      after: after.avgToolCalls.toFixed(1),
      change: change(before.avgToolCalls, after.avgToolCalls),
    },
    {
      label: "Tokens",
      before: tokens(before).toLocaleString("en-US"),
      after: tokens(after).toLocaleString("en-US"),
      change: change(tokens(before), tokens(after)),
    },
    {
      label: "Median time",
      before: `${(before.medianTotalMs / 1000).toFixed(1)}s`,
      after: `${(after.medianTotalMs / 1000).toFixed(1)}s`,
      change: change(before.medianTotalMs, after.medianTotalMs),
    },
    {
      label: "Cost per verified success",
      before: cost(before),
      after: cost(after),
      change:
        before.costPerVerifiedSuccessUsd !== null && after.costPerVerifiedSuccessUsd !== null
          ? change(before.costPerVerifiedSuccessUsd, after.costPerVerifiedSuccessUsd)
          : "–",
    },
  ];
  const name = file.replace("data/results/", "");
  const verdictTone =
    result.verdict === "improved"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : result.verdict === "regressed"
        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {result.verdict && (
          <span className={`rounded-full px-2.5 py-0.5 font-medium ${verdictTone}`}>
            {result.verdict === "no_change" ? "No clear change" : result.verdict === "improved" ? "Improved" : "Got worse"}
          </span>
        )}
        {source === "recorded" && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            Replay of recorded runs
          </span>
        )}
        <span>
          {result.repetitions} runs on each store with the same agent, measured {age(result.createdAt, now)}
          {note ? ` · ${note}` : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 text-right font-medium">Original store</th>
              <th className="px-3 py-2 text-right font-medium">With this fix</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.before}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.after}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{r.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs">
        <Link href={`/measure?compare=${name}&site=patched&run=1`} className="text-blue-700 underline dark:text-blue-400">
          See the agent&apos;s steps on the fixed store
        </Link>
        <span className="text-zinc-500"> · </span>
        <Link href={`/measure?compare=${name}&run=1`} className="text-blue-700 underline dark:text-blue-400">
          and on the original store
        </Link>
      </p>
    </div>
  );
}

/** One search card as shoppers (and the agent) see it, before and after the fix. */
function CardPreview({ preview }: { preview: NonNullable<SavedPatch["preview"]> }) {
  const before = new Set(preview.before ?? []);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500">
        One search result for &ldquo;{preview.query}&rdquo;, as a shopper sees it
      </p>
      <div className={`grid gap-3 ${preview.before ? "sm:grid-cols-2" : ""}`}>
        {preview.before && <PreviewCard title="Original store" lines={preview.before} />}
        <PreviewCard
          title="With Droid's fix"
          lines={preview.after}
          isNew={preview.before ? (line) => !before.has(line) : undefined}
        />
      </div>
    </div>
  );
}

function PreviewCard({ title, lines, isNew }: { title: string; lines: string[]; isNew?: (line: string) => boolean }) {
  return (
    <figure className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <figcaption className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</figcaption>
      <ul className="space-y-0.5 text-sm">
        {lines.map((line, i) => {
          const added = isNew?.(line) ?? false;
          return (
            <li
              key={i}
              className={
                i === 0
                  ? "font-semibold"
                  : added
                    ? "rounded bg-emerald-50 px-1 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "text-zinc-700 dark:text-zinc-300"
              }
            >
              {added && <span className="sr-only">New: </span>}
              {line}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function Expandable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{title}</summary>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">{children}</div>
    </details>
  );
}
