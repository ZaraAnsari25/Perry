// Makes an accepted fix live on localhost:3002: stops whatever serves that
// port and starts packages/optimizer/scripts/serve-patched.ts for the chosen
// saved result. Nothing goes live without someone clicking the button.

import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PatchResult } from "@agentfix/shared";

import { PATCHED_PORT, REPO, RESULTS_DIR, childEnv, listeners, measureRunning, optimizeRunning } from "@/lib/child-process";

let switching = false;

const reachable = () =>
  fetch(`http://localhost:${PATCHED_PORT}`).then(
    () => true,
    () => false,
  );

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { file?: unknown };
  // A saved result in data/results/ or its backup/ or archive/ folders, nothing else.
  const match =
    typeof body.file === "string" ? /^data\/results\/((?:backup\/|archive\/)?patch-[\w.-]+\.json)$/.exec(body.file) : null;
  if (!match?.[1]) return Response.json({ error: "Invalid result file." }, { status: 400 });
  const path = join(RESULTS_DIR, match[1]);
  if (!existsSync(path)) return Response.json({ error: "That result no longer exists." }, { status: 404 });

  const patch = JSON.parse(readFileSync(path, "utf8")) as PatchResult;
  if (patch.status !== "accepted" || patch.provenance !== "live") {
    return Response.json({ error: "Only accepted Droid fixes can go live." }, { status: 400 });
  }
  if (!existsSync(join(patch.worktreePath, "apps/storefront"))) {
    return Response.json({ error: "This fix's built copy no longer exists." }, { status: 409 });
  }
  if (optimizeRunning() || measureRunning() || switching) {
    return Response.json(
      { error: "Busy: an optimize run, a measurement or another switch is in progress." },
      { status: 409 },
    );
  }

  switching = true;
  try {
    // Stop the current fixed store; its serve-patched wrapper exits with it.
    for (const pid of await listeners(PATCHED_PORT)) process.kill(pid, "SIGTERM");
    for (let i = 0; i < 20 && (await reachable()); i++) await wait(250);

    const log = openSync(join(RESULTS_DIR, ".serve-patched.log"), "a");
    const child = spawn(process.execPath, ["scripts/serve-patched.ts", "--result", body.file as string], {
      cwd: join(REPO, "packages/optimizer"),
      env: childEnv(),
      // Keeps serving if the dashboard restarts.
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.unref();

    for (let i = 0; i < 120; i++) {
      if (await reachable()) return Response.json({ url: `http://localhost:${PATCHED_PORT}` });
      if (child.exitCode !== null) break;
      await wait(500);
    }
    return Response.json(
      { error: "The fixed store did not start. See data/results/.serve-patched.log." },
      { status: 500 },
    );
  } finally {
    switching = false;
  }
}
