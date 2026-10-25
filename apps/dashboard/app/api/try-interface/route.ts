// Feature 2, live: one run of the shopping agent on the shop commands agents use
// now (Zara's benchmark, interface mode, on localhost:3001). Streams progress;
// the run is saved to data/results/interface-<time>.json.

import { join } from "node:path";

import { AGENTS_LOCK, BASELINE_PORT, REPO, busyWith, reachable, streamScripts } from "@/lib/child-process";

export async function POST() {
  const busy = busyWith();
  if (busy) return new Response(`Busy: ${busy} is in progress.\n`, { status: 409 });
  if (!(await reachable(BASELINE_PORT))) {
    return new Response(`The original store is not running on localhost:${BASELINE_PORT}. Start it with: npm run start:store\n`, {
      status: 409,
    });
  }
  return streamScripts(
    [{ cwd: join(REPO, "packages/benchmark"), args: ["--env-file-if-exists=../../.env", "scripts/run-interface.ts", "--reps", "1"] }],
    AGENTS_LOCK,
  );
}
