"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { READ_ONLY } from "@/lib/mode";

import { ReadOnlyAction } from "./read-only-action";

/** Puts one accepted fix live on localhost:3002 through /api/serve-patched. */
export function MakeLiveButton({ file }: { file: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function makeLive() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/serve-patched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setError(body.error ?? `HTTP ${response.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (READ_ONLY) return <ReadOnlyAction label="Make this fix live" />;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={makeLive}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-perry bg-perry-wash px-4 py-2.5 text-sm font-medium text-perry-deep transition-colors hover:bg-perry hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Starting the fixed store…" : "Make this fix live on localhost:3002"}
      </button>
      <span className="text-xs text-zinc-500" aria-live="polite">
        {busy ? "About 5 seconds." : error ? <span className="text-red-700 dark:text-red-400">{error}</span> : "You approve before any fix goes live."}
      </span>
    </div>
  );
}
