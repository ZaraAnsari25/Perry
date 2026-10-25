// Starts packages/optimizer/scripts/run.ts for the trace the dashboard is
// showing and streams its progress log back as plain text. Droid and the
// Factory key stay on the server; one optimize run at a time.

import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OPTIMIZE_LOCK as LOCK, REPO, childEnv, measureRunning, optimizeRunning } from "@/lib/child-process";

// serve:patched uses 3002, so the gate's own check server uses 3003.
const CHECK_PORT = "3003";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { benchmark?: unknown; run?: unknown };
  const args = ["--env-file-if-exists=../../.env", "scripts/run.ts", "--port", CHECK_PORT];
  if (body.benchmark !== undefined) {
    const run = Number(body.run);
    if (typeof body.benchmark !== "string" || !/^(benchmark|compare)-[\w.-]+\.json$/.test(body.benchmark) || !Number.isInteger(run) || run < 1) {
      return new Response("Invalid benchmark or run.\n", { status: 400 });
    }
    args.push("--benchmark", body.benchmark, "--run", String(run));
  }
  if (optimizeRunning()) {
    return new Response("An optimize run is already in progress.\n", { status: 409 });
  }
  // A Droid build would slow the agent and distort a measurement's timings.
  if (measureRunning()) {
    return new Response("A measurement is in progress; optimize when it finishes.\n", { status: 409 });
  }

  const child = spawn(process.execPath, args, { cwd: join(REPO, "packages/optimizer"), env: childEnv() });
  writeFileSync(LOCK, String(child.pid));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The page went away; the run keeps going and still saves its result.
        }
      };
      child.stdout.on("data", (chunk: Buffer) => send(chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => send(chunk.toString()));
      child.on("close", (code) => {
        rmSync(LOCK, { force: true });
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
