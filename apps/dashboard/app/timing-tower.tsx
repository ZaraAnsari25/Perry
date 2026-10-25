"use client";

// The signature move: the ways into the store raced like cars on a timing
// tower. Rows mount in demo order, then slide to their rank on the one motion
// curve; one lap segment per agent step; every row has the same fields in the
// same places. Reduced motion shows the final order straight away.

import Link from "next/link";
import { useEffect, useState } from "react";

import type { RunAverages } from "@/lib/metrics";

export interface TowerEntry {
  label: string;
  sub: string;
  /** Null while the row hasn't been run yet in this demo session. */
  a: RunAverages | null;
  baseline?: boolean;
  /** Lap segments (0-based) to mark as wasted effort. */
  wasted?: number[];
  href?: string;
  current?: boolean;
}

const ROW = 76;

const tone = {
  best: { text: "text-best", bar: "bg-best", word: "Cheapest" },
  improved: { text: "text-improved", bar: "bg-improved", word: "Improved" },
  baseline: { text: "text-baseline", bar: "bg-baseline", word: "Original website" },
  plain: { text: "text-carbon-text", bar: "bg-carbon-muted", word: "" },
} as const;

const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `$${v.toFixed(5)}`);

export function TimingTower({
  entries,
  status,
  ranked = true,
  source,
  label = "Cost per verified purchase",
}: {
  entries: TowerEntry[];
  status: React.ReactNode;
  /** Rerank by cost (the race); false keeps the given order (laps of one car). */
  ranked?: boolean;
  /** Where the numbers come from: file and time. */
  source?: string;
  label?: string;
}) {
  const cost = (e: TowerEntry) => e.a?.costPerPurchase ?? Infinity;
  const order = ranked ? [...entries].sort((x, y) => cost(x) - cost(y)) : entries;
  const rankOf = new Map(order.map((e, i) => [e.label, i]));
  const allRun = entries.every((e) => e.a !== null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setSettled(true);
    // Let the laps fill in demo order, then rerank.
    const t = window.setTimeout(() => setSettled(true), 300 + Math.max(...entries.map((e) => Math.round(e.a?.steps ?? 0))) * 110 + 500);
    return () => window.clearTimeout(t);
  }, [entries]);
  const maxSteps = Math.max(...entries.map((e) => Math.round(e.a?.steps ?? 1)), 1);
  const kind = (e: TowerEntry): keyof typeof tone =>
    e.a === null ? "plain" : !ranked ? (e.wasted ? "plain" : "baseline") : e.baseline ? "baseline" : rankOf.get(e.label) === 0 ? "best" : "improved";

  return (
    <figure className="rounded-2xl bg-carbon p-5 text-carbon-text shadow-[0_30px_60px_-30px_rgba(13,17,23,0.55)] sm:p-6">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.08em] text-carbon-muted uppercase">
        <span>{label}</span>
        <span>{status}</span>
      </figcaption>
      <ol className="relative mt-3" style={{ height: entries.length * ROW }} aria-label={label}>
        {entries.map((e, demoIndex) => {
          const k = kind(e);
          const rank = ranked && allRun ? (rankOf.get(e.label) ?? demoIndex) : demoIndex;
          const steps = Math.max(1, Math.round(e.a?.steps ?? 1));
          const y = (settled ? rank : demoIndex) * ROW;
          const Row = e.href ? Link : "div";
          return (
            <li
              key={e.label}
              className="absolute inset-x-0 border-t border-carbon-seam transition-transform duration-[600ms] ease-[var(--ease-timing)] motion-reduce:transition-none"
              style={{ height: ROW, transform: `translateY(${y}px)` }}
            >
              <Row
                href={e.href ?? ""}
                scroll={e.href ? false : undefined}
                aria-current={e.current ? "true" : undefined}
                className={`grid h-full grid-cols-[2.25rem_minmax(0,8rem)_1fr_auto] items-center gap-3 sm:grid-cols-[2.5rem_11rem_1fr_5.5rem_4rem_6.5rem] sm:gap-4 ${
                  e.href ? "-mx-2 rounded-lg px-2 transition-colors hover:bg-carbon-seam/60" : ""
                } ${e.current ? "bg-carbon-seam/70" : ""}`}
              >
                <span className="font-mono text-sm font-semibold text-carbon-muted tabular-nums sm:text-base">
                  {ranked ? (allRun && settled ? `P${rank + 1}` : "P–") : `${demoIndex + 1}`}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.label}</span>
                  <span className="block truncate text-xs text-carbon-muted">{e.sub}</span>
                </span>
                <span className="min-w-0">
                  <span aria-hidden className="flex h-2.5 gap-1" style={{ width: e.a ? `${(steps / maxSteps) * 100}%` : "100%" }}>
                    {e.a
                      ? Array.from({ length: steps }, (_, s) => (
                          <span key={s} className="flex-1 overflow-hidden rounded-[3px] bg-carbon-seam">
                            <span
                              className={`lap-segment block h-full ${e.wasted?.includes(s) ? "bg-baseline" : tone[k].bar}`}
                              style={{ animationDelay: `${300 + demoIndex * 120 + s * 110}ms` }}
                            />
                          </span>
                        ))
                      : Array.from({ length: 6 }, (_, s) => <span key={s} className="flex-1 rounded-[3px] bg-carbon-seam" />)}
                  </span>
                  <span className="mt-1.5 block font-mono text-[11px] whitespace-nowrap text-carbon-muted tabular-nums">
                    {e.a ? `${e.a.steps.toFixed(1)} steps · ${e.a.verified}/${e.a.runs} verified` : "not run yet"}
                  </span>
                </span>
                <span className="hidden text-right font-mono text-xs text-carbon-muted tabular-nums sm:block">
                  {e.a ? `${Math.round(e.a.tokens).toLocaleString("en-US")} tok` : "—"}
                </span>
                <span className="hidden text-right font-mono text-xs text-carbon-muted tabular-nums sm:block">
                  {e.a ? `${e.a.seconds.toFixed(1)}s` : "—"}
                </span>
                <span className={`text-right font-mono text-base font-semibold tabular-nums sm:text-lg ${tone[k].text}`}>
                  {money(e.a?.costPerPurchase)}
                </span>
              </Row>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-carbon-seam pt-3 text-xs text-carbon-muted">
        {ranked ? (
          (["best", "improved", "baseline"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-sm ${tone[k].bar}`} />
              {tone[k].word}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-sm bg-baseline" />
            Wasted steps
          </span>
        )}
        <span>One lap segment per agent step. A purchase counts only if the real cart holds the right shoe.</span>
        {source && <span className="font-mono">{source}</span>}
      </p>
    </figure>
  );
}

/** "This demo session" with a live dot, or "Last recorded run". */
export function TowerStatus({ session }: { session: boolean }) {
  return session ? (
    <span className="inline-flex items-center gap-1.5 text-improved">
      <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-improved" />
      This demo session
    </span>
  ) : (
    <span>Last recorded run</span>
  );
}
