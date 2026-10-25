// Layout pieces shared by the dashboard's pages.

import Link from "next/link";

import { ArrowLeftIcon, ArrowRightIcon } from "./icons";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-4 rounded-xl border border-seam bg-panel p-5 sm:p-6 ${className}`}>{children}</div>;
}

const audienceTone = {
  perry: "text-perry-deep dark:text-perry",
  violet: "text-violet-700 dark:text-violet-300",
  blue: "text-blue-700 dark:text-blue-300",
} as const;

/** A page's heading, who it's for (under the heading), and what it does in plain words. */
export function PageHeader({
  title,
  audience,
  tone = "perry",
  children,
}: {
  title: string;
  audience?: string;
  tone?: keyof typeof audienceTone;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 pt-10 pb-2">
      <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl">{title}</h1>
      {audience && <p className={`text-sm font-medium ${audienceTone[tone]}`}>{audience}</p>}
      {children && <p className="max-w-3xl text-base leading-relaxed text-pretty text-muted">{children}</p>}
    </div>
  );
}

/** A section heading inside a page: more space above it than below. */
export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-4">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {aside && <span className="text-sm text-muted">{aside}</span>}
    </div>
  );
}

/** Back and next, in demo order, at the bottom of every page. */
export function Pager({ back, next }: { back?: { href: string; label: string }; next?: { href: string; label: string } }) {
  return (
    <nav aria-label="Previous and next step" className="flex items-center justify-between gap-4 border-t border-seam pt-6 pb-16">
      {back ? (
        <Link href={back.href} className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeftIcon />
          {back.label}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next.href}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-ground transition-colors hover:bg-perry-deep"
        >
          {next.label}
          <ArrowRightIcon />
        </Link>
      )}
    </nav>
  );
}

/** The page's main column. */
export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">{children}</main>;
}

/** "Recorded …" / "This session" style provenance chip. */
export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "perry" }) {
  const t = {
    neutral: "bg-ground text-muted ring-seam",
    amber: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900",
    perry: "bg-perry-wash text-perry-deep ring-perry/30 dark:text-perry",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${t}`}>{children}</span>;
}
