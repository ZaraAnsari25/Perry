// Small layout pieces shared by the dashboard's sections.

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  );
}

const tones = {
  zinc: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
  blue: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
} as const;

/** "Feature 1 · For agents that browse" style label. */
export function FeatureLabel({ n, tone, audience }: { n: number; tone: keyof typeof tones; audience: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      Feature {n} · {audience}
    </span>
  );
}

export function StepLabel({ children }: { children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones.zinc}`}>{children}</span>;
}

/** A section's label, heading and plain-language explanation. */
export function SectionIntro({
  label,
  id,
  title,
  children,
}: {
  label: React.ReactNode;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-zinc-200 pt-10 dark:border-zinc-800">
      <div>{label}</div>
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}
