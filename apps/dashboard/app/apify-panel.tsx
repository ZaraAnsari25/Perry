import type { ApifyAudits } from "@/lib/apify";

import { age } from "./patch-panel";
import { SectionTitle } from "./ui";

const statusTone: Record<string, string> = {
  SUCCEEDED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  READY: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

/** Runs of the Perry audit Actor on Apify: the same agent and checks, run in the cloud. */
export function ApifyPanel({ data, now }: { data: ApifyAudits; now: number }) {
  return (
    <section className="space-y-3">
      <SectionTitle>Run the same audit in the cloud, on Apify</SectionTitle>
      <p className="max-w-3xl text-sm text-muted">
        Step 1&apos;s measurement (same shopping agent, same cart check) is packaged as an Apify Actor, so anyone can audit a
        store in the cloud without this laptop. These are real runs, read from Apify.
      </p>
      {!data.ok ? (
        <p className="text-sm text-zinc-500">Apify results are unavailable: {data.reason}</p>
      ) : data.audits.length === 0 ? (
        <p className="text-sm text-zinc-500">The {data.actor} Actor has no runs yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.audits.map((a) => {
            const out = a.output;
            const v = out?.baseline;
            return (
              <li
                key={a.runId}
                className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone[a.status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
                  >
                    {a.status.toLowerCase()}
                  </span>
                  <span className="font-medium">{out?.runLabel ?? data.actor}</span>
                  <span className="text-xs text-zinc-500">ran {age(a.finishedAt ?? a.startedAt, now)}</span>
                  <a
                    href={a.consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto font-mono text-xs text-blue-700 underline dark:text-blue-400"
                  >
                    Apify run {a.runId}
                  </a>
                </div>
                {v ? (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    {out.repetitions} run{out.repetitions === 1 ? "" : "s"} on the {v.siteVersion === "patched" ? "fixed" : "original"}{" "}
                    store: <strong>{Math.round(v.completionRate * 100)}% verified</strong>, {v.avgToolCalls.toFixed(1)} steps,{" "}
                    {(v.medianTotalMs / 1000).toFixed(1)}s,{" "}
                    {v.costPerVerifiedSuccessUsd === null
                      ? "no successes"
                      : `$${v.costPerVerifiedSuccessUsd.toFixed(5)} per verified purchase`}
                    . <span className="text-zinc-500">Model {out.model}.</span>
                  </p>
                ) : (
                  <p className="text-zinc-500">No results saved for this run.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
