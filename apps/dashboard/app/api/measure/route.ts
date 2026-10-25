// Measures the fix that is live on localhost:3002: runs Zara's benchmark
// compare (the same agent, 5 runs on the original store and 5 on the fixed
// store, alternating), streams its progress, and links the saved compare file
// to the fix in data/results/measurements.json.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { PatchResult } from "@agentfix/shared";

import {
  BASELINE_PORT,
  MEASURE_LOCK,
  PATCHED_PORT,
  REPO,
  RESULTS_DIR,
  childEnv,
  liveWorktree,
  measureRunning,
  optimizeRunning,
} from "@/lib/child-process";
import { MEASUREMENT_INDEX, type MeasurementIndex } from "@/lib/results";

const REPETITIONS = 5;

const reachable = (port: number) =>
  fetch(`http://localhost:${port}`).then(
    () => true,
    () => false,
  );

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { file?: unknown };
  const match =
    typeof body.file === "string" ? /^data\/results\/((?:backup\/|archive\/)?patch-[\w.-]+\.json)$/.exec(body.file) : null;
  if (!match?.[1]) return new Response("Invalid result file.\n", { status: 400 });
  const path = join(RESULTS_DIR, match[1]);
  if (!existsSync(path)) return new Response("That fix no longer exists.\n", { status: 404 });

  const patch = JSON.parse(readFileSync(path, "utf8")) as PatchResult;
  if (patch.status !== "accepted" || patch.provenance !== "live" || !patch.toolRunId) {
    return new Response("Only accepted Droid fixes can be measured.\n", { status: 400 });
  }
  if ((await liveWorktree()) !== patch.worktreePath) {
    return new Response("Make this fix live on localhost:3002 first; measuring uses the live fixed store.\n", {
      status: 409,
    });
  }
  if (optimizeRunning() || measureRunning()) {
    return new Response("Busy: an optimize run or another measurement is in progress.\n", { status: 409 });
  }
  if (!(await reachable(BASELINE_PORT))) {
    return new Response(
      `The original store is not running on localhost:${BASELINE_PORT}. Start it with: npm run start --workspace apps/storefront\n`,
      { status: 409 },
    );
  }
  if (!(await reachable(PATCHED_PORT))) {
    return new Response(`The fixed store is not running on localhost:${PATCHED_PORT}.\n`, { status: 409 });
  }

  const child = spawn(
    process.execPath,
    ["--env-file-if-exists=../../.env", "scripts/run.ts", "--reps", String(REPETITIONS), "--compare"],
    { cwd: join(REPO, "packages/benchmark"), env: childEnv() },
  );
  writeFileSync(MEASURE_LOCK, String(child.pid));
  const toolRunId = patch.toolRunId;
  let output = "";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The page went away; the measurement keeps going and is still saved.
        }
      };
      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        send(chunk.toString());
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("close", (code) => {
        rmSync(MEASURE_LOCK, { force: true });
        // Link the saved compare file to the fix that was live while it ran.
        const saved = /^Saved (.+\/compare-[\w.-]+\.json)$/m.exec(output)?.[1];
        if (code === 0 && saved) {
          const index: MeasurementIndex = existsSync(MEASUREMENT_INDEX)
            ? (JSON.parse(readFileSync(MEASUREMENT_INDEX, "utf8")) as MeasurementIndex)
            : {};
          index[basename(saved)] = { toolRunId, source: "dashboard" };
          writeFileSync(MEASUREMENT_INDEX, `${JSON.stringify(index, null, 2)}\n`);
        }
        send(`\n[exit ${code}]\n`);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
