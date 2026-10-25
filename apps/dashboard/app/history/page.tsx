import Link from "next/link";
import { connection } from "next/server";

import { liveWorktree } from "@/lib/child-process";
import { type PatchLocation, allPatches, latestBenchmark } from "@/lib/results";

import { FixBadge, LiveBadge, PatchCard, age, source } from "../patch-panel";

const locationLabel: Record<PatchLocation, string | null> = {
  current: null,
  backup: "Demo backup",
  archive: "Archived",
};

/** Every fix Droid has produced, newest first, including archived ones. */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ tests?: string }> }) {
  await connection();
  const showTests = (await searchParams).tests === "1";
  const [patches, benchmark, live] = await Promise.all([allPatches(), latestBenchmark(), liveWorktree()]);
  const now = Date.now();

  // "Attempt #3" for runs from the saved benchmark; the sample trace otherwise.
  const attempt = new Map(benchmark?.result.baseline.runs.map((r, i) => [r.runId, i + 1]) ?? []);
  const runLabel = (traceRunId: string) => {
    const n = attempt.get(traceRunId);
    if (n) return `attempt #${n}`;
    return traceRunId.startsWith("fixture") ? "the sample trace" : "an older run";
  };

  const fixes = patches.filter((p) => !p.redTeam);
  const tests = patches.length - fixes.length;
  const shown = showTests ? patches : fixes;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <Link href="/" className="text-sm text-blue-700 underline dark:text-blue-400">
          ← Back to the dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Fix history</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every fix Factory Droid has produced, newest first: {fixes.filter((p) => p.status === "accepted").length}{" "}
          passed the safety checks ({fixes.filter((p) => p.measurements[0]?.result.verdict === "improved").length} of
          them measured to help), {fixes.filter((p) => p.status !== "accepted").length} rejected. Open one to see what it
          changed and the checks it went through.
        </p>
        {tests > 0 && (
          <p className="text-sm">
            {showTests ? (
              <Link href="/history" className="text-blue-700 underline dark:text-blue-400">
                Hide the {tests} safety tests
              </Link>
            ) : (
              <Link href="/history?tests=1" className="text-blue-700 underline dark:text-blue-400">
                Also show the {tests} safety tests (simulated bad fixes and red-team runs)
              </Link>
            )}
          </p>
        )}
      </header>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          No fixes yet. Click <strong>Optimize with Factory Droid</strong> on the dashboard.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => {
            const isLive = live !== undefined && p.worktreePath === live;
            const where = locationLabel[p.location];
            return (
              <li key={p.file}>
                <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
                    <FixBadge patch={p} />
                    {isLive && <LiveBadge />}
                    <span className="font-medium">
                      {p.redTeam ? source(p) : `Droid fix for ${runLabel(p.traceRunId)}`}
                    </span>
                    <span className="text-xs text-zinc-500">generated {age(p.createdAt, now)}</span>
                    {where && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {where}
                      </span>
                    )}
                  </summary>
                  <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                    <PatchCard patch={p} now={now} live={live} replay={p.location === "backup"} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
