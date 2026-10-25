// Feature 2, live: Factory Droid writes the store's shop commands and Perry runs
// its five gates (packages/optimizer/scripts/generate-interface.ts, with the real
// cart on localhost:3001). If they pass, use-generated.ts puts the new commands
// in packages/agent-interface/generated/core.ts, which agents use from their next
// start. Nothing is committed. Streams progress.

import { join } from "node:path";

import { BASELINE_PORT, GENERATE_LOCK, REPO, busyWith, reachable, streamScripts } from "@/lib/child-process";

export async function POST() {
  const busy = busyWith();
  if (busy) return new Response(`Busy: ${busy} is in progress.\n`, { status: 409 });
  if (!(await reachable(BASELINE_PORT))) {
    return new Response(
      `The original store is not running on localhost:${BASELINE_PORT}; the last check buys a shoe on its real cart. Start it with: npm run start:store\n`,
      { status: 409 },
    );
  }
  const optimizer = join(REPO, "packages/optimizer");
  return streamScripts(
    [
      {
        cwd: optimizer,
        args: ["--env-file-if-exists=../../.env", "scripts/generate-interface.ts", "--store-url", `http://localhost:${BASELINE_PORT}`],
      },
      { cwd: optimizer, args: ["scripts/use-generated.ts"] },
    ],
    GENERATE_LOCK,
  );
}
