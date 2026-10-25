"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RunState = "idle" | "running" | "done" | "error";
type StepState = "pending" | "active" | "done" | "failed";

interface Step {
  label: string;
  state: StepState;
  detail?: string;
}

const has = (lines: string[], pattern: RegExp) => lines.some((l) => pattern.test(l));

// When each step counts as finished, read from the run log (see packages/optimizer).
// Droid is finished once the run moves past it: to the allowlist result or a
// rejection, but not when Droid itself failed.
const STEPS: { label: string; done: (lines: string[]) => boolean }[] = [
  { label: "Make a safe copy of the store", done: (l) => has(l, /^worktree:/) },
  { label: "Droid writes the fix", done: (l) => has(l, /^allowlist:/) || (has(l, /^rejected: /) && has(l, /^running Factory Droid/)) },
  { label: "Check only allowed files changed", done: (l) => has(l, /^allowlist: pass/) },
  { label: "Check the fixed store builds", done: (l) => has(l, /^build: pass/) },
  { label: "Check prices and stock are still correct", done: (l) => has(l, /^search pages: pass/) },
];

const LOOKS = /^\[tool\] (Read|Grep|Glob|LS)\b/;
const EDITS = /^\[tool\] (ApplyPatch|Edit|Create|MultiEdit)\b/;

/** Turns the streamed run log into a plain-language checklist. */
function progress(log: string): { steps: Step[]; outcome?: { ok: boolean; text: string } } {
  const lines = log.split("\n");
  const done = STEPS.map((s) => s.done(lines));
  const firstOpen = done.indexOf(false);
  const failure = lines.find((l) => /^(rejected|failed): /.test(l));
  const status = lines.find((l) => l.startsWith("status:"))?.replace(/^status:\s*/, "");

  const looks = lines.filter((l) => LOOKS.test(l)).length;
  const edits = lines.filter((l) => EDITS.test(l)).length;
  const blocked = lines.some((l) => l.startsWith("permission handler blocked:"));
  const droidDetail = lines.some((l) => l.startsWith("running Factory Droid"))
    ? `${looks} look${looks === 1 ? "" : "s"} at the code, ${edits} edit${edits === 1 ? "" : "s"}` +
      (blocked ? " · a forbidden change was blocked" : "")
    : undefined;

  const steps = STEPS.map((s, i): Step => {
    let state: StepState = done[i] ? "done" : "pending";
    if (i === firstOpen) state = failure ? "failed" : status ? "pending" : "active";
    return { label: s.label, state, detail: i === 1 ? droidDetail : i === firstOpen && failure ? failure.replace(/^(rejected|failed): /, "") : undefined };
  });

  if (status === "accepted") {
    return { steps, outcome: { ok: true, text: "The fix passed every safety check. See it below; measure it to find out whether it helps." } };
  }
  if (status) return { steps, outcome: { ok: false, text: "Fix not accepted. See why below." } };
  return { steps };
}

const icon: Record<StepState, string> = { pending: "○", active: "◐", done: "✓", failed: "✗" };
const tone: Record<StepState, string> = {
  pending: "text-zinc-400",
  active: "text-blue-600 dark:text-blue-400 animate-pulse",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
};

/** Runs optimize() on the shown trace through /api/optimize and shows its progress. */
export function OptimizeButton({ benchmark, run }: { benchmark?: string; run?: number }) {
  const router = useRouter();
  const [state, setState] = useState<RunState>("idle");
  const [log, setLog] = useState("");

  async function start() {
    setState("running");
    setLog("");
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(benchmark ? { benchmark, run } : {}),
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
      setState(response.ok ? "done" : "error");
      // Show the saved result in the Patch section.
      router.refresh();
    } catch (error) {
      setLog((prev) => `${prev}\n${error instanceof Error ? error.message : String(error)}`);
      setState("error");
    }
  }

  const { steps, outcome } = progress(log);
  const refused = state === "error" && !log.includes("worktree:");

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={state === "running"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {state === "running" ? "Optimizing…" : "Optimize with Factory Droid"}
        </button>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {state === "idle"
            ? "Factory Droid fixes a copy of the store; Perry checks the fix before accepting it."
            : state === "running"
              ? "Usually takes about a minute."
              : null}
        </p>
      </div>

      {state !== "idle" && (
        <div aria-live="polite" className="space-y-3">
          {refused ? (
            <p className="text-sm text-red-700 dark:text-red-400">{log.trim() || "The request failed."}</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {steps.map((s) => (
                <li key={s.label} className="flex gap-2">
                  <span aria-hidden className={`w-4 shrink-0 text-center ${tone[s.state]}`}>
                    {icon[s.state]}
                  </span>
                  <span className={s.state === "pending" ? "text-zinc-500" : ""}>
                    {s.label}
                    <span className="sr-only"> ({s.state})</span>
                    {s.detail && <span className="block text-xs text-zinc-500">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {outcome && (
            <p
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                outcome.ok
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
              }`}
            >
              {outcome.ok ? "✅ " : "⛔ "}
              {outcome.text}
            </p>
          )}
          {log && !refused && (
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
