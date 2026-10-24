import type { PatchStatus } from "@agentfix/shared";

import type { SavedPatch } from "@/lib/results";

const statusTone: Record<PatchStatus, string> = {
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  failed: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
};

const gates = [
  { key: "allowlist", label: "Allowlist", detail: "Diff touches only allowed files" },
  { key: "build", label: "Build", detail: "Patched storefront builds" },
  { key: "tests", label: "Search pages", detail: "Same results; cards match the catalog" },
] as const;

/** Who produced the patch. Simulated patches are scripted tests, never shown as Droid's. */
function source(patch: SavedPatch): string {
  if (patch.hostile) return `Simulated hostile patch "${patch.hostile}" (scripted test, not Droid)`;
  if (patch.redTeam) return "Factory Droid, given a red-team prompt asking for a forbidden change";
  return "Factory Droid";
}

export function PatchPanel({ patches }: { patches: SavedPatch[] }) {
  const [latest, ...earlier] = patches;
  return (
    <section aria-labelledby="patch-heading" className="space-y-3">
      <h2 id="patch-heading" className="text-lg font-semibold">
        Patch
      </h2>
      {latest ? <PatchCard patch={latest} /> : <NoPatch />}
      {earlier.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Earlier runs</h3>
          <ul className="space-y-2">
            {earlier.map((p) => (
              <li key={p.file}>
                <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <StatusBadge status={p.status} />
                    <span>{source(p)}</span>
                    <span className="text-xs text-zinc-500">{when(p.createdAt)}</span>
                  </summary>
                  <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                    <PatchCard patch={p} />
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

const when = (iso: string) => (iso ? new Date(iso).toLocaleString("en-US") : "unknown time");

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
      No patch has been generated yet. Run{" "}
      <code className="font-mono">npm run optimize --workspace packages/optimizer</code> to have Factory
      Droid patch the storefront; the result appears here.
    </div>
  );
}

function PatchCard({ patch }: { patch: SavedPatch }) {
  return (
    <article className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={patch.status} />
        <span className="text-xs text-zinc-500">
          {source(patch)} · {when(patch.createdAt)} · run <code className="font-mono">{patch.traceRunId}</code>
        </span>
      </div>

      {patch.explanation && (
        <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm dark:border-zinc-700">
          <div className="text-xs font-medium text-zinc-500">
            {patch.provenance === "fixture" ? "What the simulated patch does" : "Droid's summary"}
          </div>
          {patch.explanation}
        </blockquote>
      )}

      <p className="text-xs font-medium text-zinc-500">Checks AgentFix ran on the patch</p>

      <ul className="grid gap-2 sm:grid-cols-3">
        {gates.map((g) => {
          const passed = patch.checks[g.key];
          return (
            <li
              key={g.key}
              className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
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

      {patch.blocked.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <div className="font-medium text-amber-900 dark:text-amber-200">
            Blocked during the Droid run by the permission handler
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

      <dl className="grid gap-x-6 gap-y-1 text-xs text-zinc-600 sm:grid-cols-[max-content_1fr] dark:text-zinc-400">
        <dt className="font-medium">Files changed</dt>
        <dd className="font-mono">{patch.filesChanged.join(", ") || "none"}</dd>
        <dt className="font-medium">Base commit</dt>
        <dd className="font-mono">{patch.baseCommit.slice(0, 7)}</dd>
        <dt className="font-medium">Droid session</dt>
        <dd className="font-mono">{patch.toolRunId ?? "none"}</dd>
        <dt className="font-medium">Worktree</dt>
        <dd className="break-all font-mono">{patch.worktreePath || "none"}</dd>
        <dt className="font-medium">Saved result</dt>
        <dd className="font-mono">{patch.file}</dd>
      </dl>

      {patch.diff && (
        <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">View diff</summary>
          <pre className="overflow-x-auto border-t border-zinc-200 p-3 font-mono text-xs leading-relaxed dark:border-zinc-800">
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
        </details>
      )}
    </article>
  );
}
