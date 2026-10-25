"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RunState = "idle" | "running" | "done" | "error";

// Lines the benchmark script prints per agent run, e.g. "  baseline 3/5: verified · 7 tool calls · …".
const RUN_LINE = /^\s*(baseline|patched) (\d+)\/(\d+): (verified|FAILED)/;

/** Measures the live fix through /api/measure (5 agent runs per store) and shows progress. */
export function MeasureButton({ file }: { file: string }) {
  const router = useRouter();
  const [state, setState] = useState<RunState>("idle");
  const [log, setLog] = useState("");

  async function start() {
    setState("running");
    setLog("");
    try {
      const response = await fetch("/api/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });
      if (!response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setLog(text);
      }
      setState(response.ok && /^Saved /m.test(text) ? "done" : "error");
      // Show the measurement on the fix card.
      router.refresh();
    } catch (error) {
      setLog((prev) => `${prev}\n${error instanceof Error ? error.message : String(error)}`);
      setState("error");
    }
  }

  const runs = log
    .split("\n")
    .map((l) => RUN_LINE.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);
  const total = Number(runs[0]?.[3] ?? 5);
  const count = (site: string) => runs.filter((m) => m[1] === site).length;
  const failed = runs.filter((m) => m[4] === "FAILED").length;
  const saved = /^Saved /m.test(log);
  const refused = log.length > 0 && runs.length === 0 && !log.includes("agent runs");

  const steps = [
    { label: "Agent runs on the original store", done: count("baseline"), of: total },
    { label: "Agent runs on this fix", done: count("patched"), of: total },
  ];

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={state === "running"}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {state === "running" ? "Measuring…" : "Measure this fix"}
        </button>
        <p className="text-xs text-zinc-500">
          {state === "idle"
            ? `Runs the same shopping agent ${total} times on each store and compares them. About 2 minutes and a few cents of Anthropic usage.`
            : state === "running"
              ? "Runs alternate between the two stores so both see the same conditions."
              : null}
        </p>
      </div>

      {state !== "idle" && (
        <div aria-live="polite" className="space-y-2 text-sm">
          {refused && state === "error" ? (
            <p className="text-red-700 dark:text-red-400">{log.trim()}</p>
          ) : (
            <ol className="space-y-1">
              {steps.map((s) => (
                <li key={s.label} className="flex gap-2">
                  <span
                    aria-hidden
                    className={`w-4 shrink-0 text-center ${
                      s.done === s.of
                        ? "text-emerald-600 dark:text-emerald-400"
                        : state === "running"
                          ? "animate-pulse text-blue-600 dark:text-blue-400"
                          : "text-zinc-400"
                    }`}
                  >
                    {s.done === s.of ? "✓" : "◐"}
                  </span>
                  <span>
                    {s.label}: {s.done} of {s.of}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {failed > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {failed} run{failed === 1 ? "" : "s"} did not end with the right item in the cart. They count against that
              store&apos;s success rate.
            </p>
          )}
          {state === "done" && saved && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              ✅ Measured. The before/after result is shown below.
            </p>
          )}
          {state === "error" && !refused && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/40 dark:text-red-300">
              The measurement did not finish. See the technical log.
            </p>
          )}
          {log && !(refused && state === "error") && (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500">Show technical log</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 font-mono leading-relaxed text-zinc-100">
                {log}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
