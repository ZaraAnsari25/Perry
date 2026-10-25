// The online copy (Vercel) is read-only: it shows recorded real runs and never
// starts agents, Droid or stores. Set NEXT_PUBLIC_PERRY_READ_ONLY=1 there; the
// laptop demo leaves it unset and behaves as before.

export const READ_ONLY = process.env.NEXT_PUBLIC_PERRY_READ_ONLY === "1";

export const READ_ONLY_REASON =
  "This online copy shows recorded real runs. Live runs happen on our laptop during the demo.";

/** The original store, and the store with a Droid fix. */
export const STORE_URL = process.env.NEXT_PUBLIC_STORE_URL ?? "http://localhost:3001";
export const FIXED_STORE_URL = process.env.NEXT_PUBLIC_FIXED_STORE_URL ?? "http://localhost:3002";

/** "localhost:3002" or "perry-fixed.vercel.app", for link text. */
export const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** The recorded fix the online fixed store is built from (branch vercel-fixed-store). */
export const ONLINE_FIX_FILE = "patch-2026-10-25T13-18-11-478Z.json";
