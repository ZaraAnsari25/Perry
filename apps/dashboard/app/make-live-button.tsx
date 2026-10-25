"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={makeLive}
        disabled={busy}
        className="rounded-md border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
      >
        {busy ? "Starting the fixed store…" : "Make this fix live on localhost:3002"}
      </button>
      <span className="text-xs text-zinc-500" aria-live="polite">
        {busy ? "About 5 seconds." : error ? <span className="text-red-700 dark:text-red-400">{error}</span> : "You approve before any fix goes live."}
      </span>
    </div>
  );
}
