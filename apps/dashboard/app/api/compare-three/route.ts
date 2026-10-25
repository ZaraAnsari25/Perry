// Results, live: the same agent 5 times each on the original store (3001), the
// store with the live Droid fix (3002) and the shop commands (Zara's
// compareThree). Streams progress; saved to data/results/compare3-<time>.json.

import { join } from "node:path";

import { AGENTS_LOCK, BASELINE_PORT, PATCHED_PORT, REPO, busyWith, reachable, streamScripts } from "@/lib/child-process";

export async function POST() {
  const busy = busyWith();
  if (busy) return new Response(`Busy: ${busy} is in progress.\n`, { status: 409 });
  if (!(await reachable(BASELINE_PORT))) {
    return new Response(`The original store is not running on localhost:${BASELINE_PORT}. Start it with: npm run start:store\n`, {
      status: 409,
    });
  }
  if (!(await reachable(PATCHED_PORT))) {
    return new Response(`No fixed store on localhost:${PATCHED_PORT}. Make a Feature 1 fix live first.\n`, { status: 409 });
  }
  return streamScripts(
    [
      {
        cwd: join(REPO, "packages/benchmark"),
        args: ["--env-file-if-exists=../../.env", "scripts/run-interface.ts", "--reps", "5", "--three"],
      },
    ],
    AGENTS_LOCK,
  );
}
