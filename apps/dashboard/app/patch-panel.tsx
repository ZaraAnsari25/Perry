import type { PatchStatus } from "@agentfix/shared";

import type { SavedPatch } from "@/lib/results";

const statusTone: Record<PatchStatus, string> = {
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  failed: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
};

const verdict: Record<PatchStatus, string> = {
  accepted: "Accepted: the fix passed every check.",
  rejected: "Rejected: the fix failed a check, so it was not used.",
  failed: "Droid did not finish, so there is no fix to check.",
};

// The three gates, in plain words. The keys match PatchResult.checks.
const gates = [
  { key: "allowlist", label: "Only allowed files changed", detail: "The search card and search code; never prices or stock" },
  { key: "build", label: "Builds successfully", detail: "The fixed store compiles and runs" },
  { key: "tests", label: "Prices and stock still correct", detail: "Every search card matches the catalog" },
] as const;

/** Who produced the patch. Simulated patches are scripted tests, never shown as Droid's. */
function source(patch: SavedPatch): string {
  if (patch.hostile) return `Simulated hostile patch "${patch.hostile}" (scripted test, not Droid)`;
  if (patch.redTeam) return "Factory Droid, given a red-team prompt asking for a forbidden change";
  return "Factory Droid";
}

/** "just now", "12 minutes ago", or a date, relative to when the page was rendered. */
function age(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes)) return "at an unknown time";
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  return `on ${new Date(iso).toLocaleString("en-US")}`;
}

/**
 * Fixes generated from the run being viewed, newest first. When there are
 * none, the saved backup can be shown on request, labeled as a replay.
 */
export function PatchPanel({
  patches,
  backup,
  now,
}: {
  patches: SavedPatch[];
  backup: SavedPatch | null;
  now: number;
}) {
  const [latest, ...earlier] = patches;
  return (
    <section aria-labelledby="patch-heading" className="space-y-3">
      <h2 id="patch-heading" className="text-lg font-semibold">
        Fix for this run
      </h2>
      {latest ? <PatchCard patch={latest} now={now} /> : <NoPatch />}
      {!latest && backup && (
        <details className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700">
          <summary className="cursor-pointer px-4 py-3 text-sm">
            <span className="font-medium">Show the saved backup fix</span>{" "}
            <span className="text-zinc-500">
              (a real Droid fix generated {age(backup.createdAt, now)}, for use if a live run fails)
            </span>
          </summary>
          <div className="border-t border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <PatchCard patch={backup} now={now} replay />
          </div>
        </details>
      )}
      {earlier.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Earlier fixes for this run</h3>
          <ul className="space-y-2">
            {earlier.map((p) => (
              <li key={p.file}>
                <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <StatusBadge status={p.status} />
                    <span>{source(p)}</span>
                    <span className="text-xs text-zinc-500">generated {age(p.createdAt, now)}</span>
                  </summary>
                  <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                    <PatchCard patch={p} now={now} />
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

function StatusBadge({ status }: { status: PatchStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusTone[status]}`}>
      {status}
    </span>
  );
}

function NoPatch() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      No fix yet for this run. Click <strong>Optimize with Factory Droid</strong> above; the result
      appears here.
    </div>
  );
}

function PatchCard({ patch, now, replay = false }: { patch: SavedPatch; now: number; replay?: boolean }) {
  return (
    <article className="space-y-5 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={patch.status} />
          {replay && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              Replay of an earlier run
            </span>
          )}
          <span className="text-xs text-zinc-500">
            {source(patch)} · generated {age(patch.createdAt, now)}
          </span>
        </div>
        <p className="text-base font-medium">{verdict[patch.status]}</p>
      </header>

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
        <p className="text-xs font-medium text-zinc-500">Checks AgentFix ran before accepting the fix</p>
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
          <div className="font-medium text-amber-900 dark:text-amber-200">
            Droid tried to change something it wasn&apos;t allowed to, and AgentFix stopped it
          </div>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {patch.blocked.map((b) => (
              <li key={b}>{b}</li>
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
