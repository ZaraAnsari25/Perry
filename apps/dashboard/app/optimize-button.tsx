"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MakeLiveButton } from "./make-live-button";

/** A first attempt plus two retries; matches the optimize route's cap. */
const MAX_ATTEMPTS = 3;

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
function progress(log: string): { steps: Step[]; outcome?: { ok: boolean; text: string; reason?: string } } {
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
    return {
      steps,
      outcome: { ok: true, text: "The fix passed every safety check. Make it live to try it, then measure whether it helps." },
    };
  }
  if (status) {
    return {
      steps,
      outcome: {
        ok: false,
        text: "Droid's fix didn't pass the checks, so it wasn't used. Nothing on the store changed.",
        reason: failure?.replace(/^(rejected|failed): /, ""),
      },
    };
  }
  return { steps };
}

/** The saved result file and attempt number, read from the run log. */
function resultInfo(log: string): { file?: string; attempt: number } {
  const file = /^saved:\s+.*?(data\/results\/patch-[\w.-]+\.json)\s*$/m.exec(log)?.[1];
  const attempt = Number(/^retry:\s+attempt (\d+)/m.exec(log)?.[1] ?? 1);
  return { file, attempt };
}

const icon: Record<StepState, string> = { pending: "○", active: "◐", done: "✓", failed: "✗" };
const tone: Record<StepState, string> = {
  pending: "text-zinc-400",
  active: "text-blue-600 dark:text-blue-400 animate-pulse",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
};

/**
 * Runs optimize() on the shown trace through /api/optimize and shows its
 * progress, then the next step: make an accepted fix live, or try again (Droid
 * is told why the last attempt failed) or choose an earlier fix.
 */
export function OptimizeButton({
  benchmark,
  run,
  retryOf,
  attempt: retryAttempt = 1,
  hasEarlierFixes,
}: {
  benchmark?: string;
  run?: number;
  /** A fix that wasn't accepted: the button then retries it instead of starting fresh. */
  retryOf?: string;
  /** Attempt number of retryOf. */
  attempt?: number;
  hasEarlierFixes: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<RunState>("idle");
  const [log, setLog] = useState("");

  async function start(previous?: string) {
    setState("running");
    setLog("");
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(benchmark ? { benchmark, run } : {}), ...(previous ? { retryOf: previous } : {}) }),
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
      // Show the saved result in the fix section.
      router.refresh();
    } catch (error) {
      setLog((prev) => `${prev}\n${error instanceof Error ? error.message : String(error)}`);
      setState("error");
    }
  }

  const { steps, outcome } = progress(log);
  const refused = state === "error" && !log.includes("worktree:");
  const result = resultInfo(log);
  const isRetry = retryOf !== undefined;
  const nextAttempt = (isRetry ? retryAttempt : 0) + 1;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      {state === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => start(retryOf)}
            disabled={isRetry && nextAttempt > MAX_ATTEMPTS}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isRetry ? "Try again with Droid" : "Optimize with Factory Droid"}
          </button>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {!isRetry
              ? "Factory Droid fixes a copy of the store; Perry checks the fix before accepting it."
              : nextAttempt > MAX_ATTEMPTS
                ? `Droid has tried ${MAX_ATTEMPTS} times for this run.`
                : `Droid tries again and is told why the last attempt wasn't accepted (attempt ${nextAttempt} of ${MAX_ATTEMPTS}).`}
          </p>
          {isRetry && hasEarlierFixes && <EarlierFixesLink />}
        </div>
      )}

      {state === "running" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {log.includes("retry:") ? "Droid is trying again with feedback. " : "Optimizing. "}Usually takes about a minute.
        </p>
      )}

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

          {outcome?.ok && (
            <div className="space-y-2 rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">✅ {outcome.text}</p>
              {result.file && <MakeLiveButton file={result.file} />}
            </div>
          )}

          {outcome && !outcome.ok && (
            <div className="space-y-2 rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/40">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">⛔ {outcome.text}</p>
              {outcome.reason && <p className="text-xs text-red-900 dark:text-red-200">Why: {outcome.reason}</p>}
              <div className="flex flex-wrap items-center gap-3">
                {result.file && result.attempt < MAX_ATTEMPTS ? (
                  <button
                    type="button"
                    onClick={() => start(result.file)}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Try again with Droid
                  </button>
                ) : (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Droid has tried {MAX_ATTEMPTS} times for this run.
                  </span>
                )}
                {result.file && result.attempt < MAX_ATTEMPTS && (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Droid is told why this attempt wasn&apos;t accepted (attempt {result.attempt + 1} of {MAX_ATTEMPTS}).
                  </span>
                )}
                {hasEarlierFixes && <EarlierFixesLink />}
              </div>
            </div>
          )}

          {state !== "running" && !outcome && !refused && (
            <button
              type="button"
              onClick={() => start(retryOf)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Run again
            </button>
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

function EarlierFixesLink() {
  return (
    <Link href="/history" className="text-sm font-medium text-blue-700 underline dark:text-blue-400">
      Choose an earlier fix
    </Link>
  );
}
