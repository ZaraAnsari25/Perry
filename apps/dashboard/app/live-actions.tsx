"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StateMark } from "./icons";
import { READ_ONLY } from "@/lib/mode";

import { ReadOnlyAction } from "./read-only-action";

type RunState = "idle" | "running" | "done" | "error";
type Kind = "generate" | "try" | "compare";

interface Progress {
  label: string;
  state: "pending" | "running" | "done" | "failed" | "skipped";
  detail?: string;
}

const config: Record<
  Kind,
  {
    endpoint: string;
    label: string;
    running: string;
    note: string;
    success: RegExp;
    done: string;
  }
> = {
  generate: {
    endpoint: "/api/generate-interface",
    label: "Generate the commands with Droid",
    running: "Droid is working…",
    note: "Factory Droid writes this store's shop commands from scratch, then Perry runs all five checks, including a real purchase. About 2 to 3 minutes.",
    success: /^Copied /m,
    done: "Droid's new commands passed every check, and agents now use them.",
  },
  try: {
    endpoint: "/api/try-interface",
    label: "Run the shopping agent with these commands",
    running: "The agent is shopping…",
    note: "One real run of the same agent and task as Step 1, using the commands. About 10 seconds and under a cent.",
    success: /^Saved /m,
    done: "Done. The run is shown below.",
  },
  compare: {
    endpoint: "/api/compare-three",
    label: "Run the comparison",
    running: "Comparing…",
    note: "Runs the same agent 5 times each way: the original website, the fixed website and the shop commands. About 2 minutes and a few cents.",
    success: /^Saved /m,
    done: "Compared. The results are shown below.",
  },
};

const GATES = [
  ["allowlist", "Changed only its one file"],
  ["independence", "Wrote its own code"],
  ["typecheck", "Compiles"],
  ["contract tests", "Every answer matches the catalog"],
  ["integration", "A real purchase verifies"],
] as const;

/** Turns a script's streamed log into plain-language steps. */
function progress(kind: Kind, log: string, running: boolean): Progress[] {
  const lines = log.split("\n");
  if (kind === "generate") {
    const droidStarted = log.includes("running Factory Droid");
    const droidActions = lines.filter((l) => l.startsWith("[tool] ")).length;
    const passed = new Set(
      lines.flatMap((l) => /^([a-z ]+): pass \(/.exec(l)?.[1] ?? []),
    );
    const failed = new Map(
      lines.flatMap((l) => {
        const m = /^✗ ([a-z ]+): (.+)$/.exec(l);
        return m ? [[m[1]!, m[2]!] as const] : [];
      }),
    );
    const skipped = new Set(
      lines.flatMap((l) => /^– ([a-z ]+): /.exec(l)?.[1] ?? []),
    );
    const droidDone =
      passed.size > 0 || failed.size > 0 || /^(rejected|failed): /m.test(log);
    let current = !droidDone;
    const steps: Progress[] = [
      {
        label: "Droid reads the store and writes the commands",
        state: droidDone
          ? "done"
          : droidStarted && running
            ? "running"
            : "pending",
        detail:
          droidActions === 0
            ? undefined
            : droidDone
              ? `${droidActions} actions: read files, wrote code`
              : `${droidActions} actions so far: reading files, writing code`,
      },
    ];
    for (const [name, label] of GATES) {
      const state: Progress["state"] = passed.has(name)
        ? "done"
        : failed.has(name)
          ? "failed"
          : skipped.has(name)
            ? "skipped"
            : !current && running
              ? "running"
              : "pending";
      if (state === "running") current = true;
      steps.push({ label: `Check: ${label}`, state, detail: failed.get(name) });
    }
    steps.push({
      label: "Agents switch to the new commands",
      state: /^Copied /m.test(log)
        ? "done"
        : passed.size === GATES.length && running
          ? "running"
          : "pending",
    });
    return steps;
  }
  const RUN =
    /^\s*(baseline|patched|agent-interface) (\d+)\/(\d+): (verified|FAILED)/;
  const runs = lines
    .map((l) => RUN.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);
  const sites =
    kind === "try"
      ? ([["agent-interface", "The agent shops with the commands", 1]] as const)
      : ([
          ["baseline", "Original website", 5],
          ["patched", "Fixed website (Feature 1)", 5],
          ["agent-interface", "Shop commands (Feature 2)", 5],
        ] as const);
  return sites.map(([site, label, of]) => {
    const mine = runs.filter((m) => m[1] === site);
    const failedRuns = mine.filter((m) => m[4] === "FAILED").length;
    return {
      label: `${label}: ${mine.length} of ${of} runs`,
      state: mine.length >= of ? "done" : running ? "running" : "pending",
      detail:
        failedRuns > 0
          ? `${failedRuns} didn't end with the right item in the cart`
          : undefined,
    };
  });
}

/** A drawn mark per step state; running is a spinning arc. */
function Mark({ state }: { state: Progress["state"] }) {
  if (state === "running")
    return (
      <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 animate-spin text-perry">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.75" />
        <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  return <StateMark state={state} />;
}

/** A button that starts a dashboard job, streams its progress in plain words, then refreshes the page. */
export function LiveAction({
  kind,
  disabledReason,
}: {
  kind: Kind;
  disabledReason?: string;
}) {
  const router = useRouter();
  const c = config[kind];
  const [state, setState] = useState<RunState>("idle");
  const [log, setLog] = useState("");

  async function start() {
    setState("running");
    setLog("");
    let text = "";
    try {
      const response = await fetch(c.endpoint, { method: "POST" });
      if (!response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setLog(text);
      }
      setState(response.ok && c.success.test(text) ? "done" : "error");
      router.refresh();
    } catch (error) {
      setLog(
        `${text}\n${error instanceof Error ? error.message : String(error)}`,
      );
      setState("error");
    }
  }

  const refused = state === "error" && !/\[exit \d+\]/.test(log);
  const steps =
    state === "idle" || refused ? [] : progress(kind, log, state === "running");
  const reason = /^(rejected|failed): (.+)$/m.exec(log)?.[2];

  if (READ_ONLY) return <ReadOnlyAction label={c.label} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={state === "running" || disabledReason !== undefined}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-ground transition-colors hover:bg-perry-deep disabled:cursor-not-allowed disabled:bg-seam disabled:text-faint"
        >
          {state === "running"
            ? c.running
            : state === "idle"
              ? c.label
              : `${c.label} again`}
        </button>
        <p className="max-w-xl text-xs text-zinc-500">
          {disabledReason ?? (state === "idle" ? c.note : null)}
        </p>
      </div>

      {steps.length > 0 && (
        <ol aria-live="polite" className="space-y-1.5 text-sm">
          {steps.map((s) => (
            <li key={s.label} className="flex gap-2">
              <span className="mt-0.5">
                <Mark state={s.state} />
              </span>
              <span>
                {s.label}
                <span className="sr-only"> ({s.state})</span>
                {s.detail && (
                  <span className="block text-xs text-zinc-500">
                    {s.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {state === "done" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {c.done}
        </p>
      )}
      {state === "error" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          {refused
            ? log.trim()
            : kind === "generate" && reason
              ? `Perry turned Droid's commands away: ${reason} Agents keep using the commands they had.`
              : "It didn't finish. See the technical log."}
        </p>
      )}
      {log && !refused && (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-500">
            Show technical log
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 font-mono leading-relaxed text-zinc-100">
            {log}
          </pre>
        </details>
      )}
    </div>
  );
}
