// One small icon set, drawn on a 16px grid with a 1.75 stroke.

type IconProps = { className?: string; title?: string };

function Svg({ className = "h-4 w-4", title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Svg>
);

export const CrossIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Svg>
);

export const PendingIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5" />
  </Svg>
);

export const SkipIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 8h7" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </Svg>
);

/** A check, cross, dash or open circle for a state, with its word for screen readers. */
export function StateMark({ state, className = "h-4 w-4" }: { state: "done" | "failed" | "skipped" | "pending"; className?: string }) {
  const tone = {
    done: "text-improved",
    failed: "text-failed",
    skipped: "text-faint",
    pending: "text-faint",
  }[state];
  const title = { done: "passed", failed: "failed", skipped: "skipped", pending: "not run yet" }[state];
  const Icon = { done: CheckIcon, failed: CrossIcon, skipped: SkipIcon, pending: PendingIcon }[state];
  return (
    <span className={`inline-flex shrink-0 ${tone}`}>
      <Icon className={className} title={title} />
    </span>
  );
}
