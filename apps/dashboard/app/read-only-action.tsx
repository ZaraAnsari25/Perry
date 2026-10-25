import { READ_ONLY_REASON } from "@/lib/mode";

/** A live button in the online copy: shown greyed out, with why. */
export function ReadOnlyAction({ label }: { label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-seam px-4 py-2.5 text-sm font-medium text-faint"
      >
        {label}
      </button>
      <p className="max-w-xl text-xs text-zinc-500">{READ_ONLY_REASON}</p>
    </div>
  );
}
