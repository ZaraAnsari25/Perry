"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import type { Progress } from "@/lib/progress";

export const STEPS = [
  { href: "/", label: "Overview", key: null },
  { href: "/measure", label: "Measure", n: 1, key: "measure" },
  { href: "/website", label: "Fix the website", n: 2, key: "website" },
  { href: "/commands", label: "Shop commands", n: 3, key: "commands" },
  { href: "/results", label: "Results", key: "results" },
] as const;

/** The five steps in demo order; each one's line fills when it's done in this demo session. */
export function StepNav({ progress }: { progress: Progress }) {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  // On narrow screens the bar scrolls; keep the current step in view.
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  return (
    <nav ref={nav} aria-label="Demo steps" className="relative flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] lg:justify-end">
      <ol className="flex gap-1">
        {STEPS.map((s) => {
          const current = s.href === "/" ? path === "/" : path.startsWith(s.href);
          const done = s.key !== null && progress[s.key];
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={current ? "page" : undefined}
                className={`group block w-36 rounded-md px-2.5 pt-2 pb-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-300 ${
                  current ? "text-ink" : "text-faint hover:text-ink"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {"n" in s && <span className="font-mono text-[11px] tabular-nums">{s.n}</span>}
                  {s.label}
                  {done && <span className="sr-only">(done)</span>}
                </span>
                <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-seam">
                  <span
                    className={`block h-full rounded-full transition-[width,background-color] duration-[600ms] ease-[var(--ease-timing)] ${
                      done ? "w-full bg-perry" : current ? "w-1/3 bg-ink" : "w-0"
                    }`}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
