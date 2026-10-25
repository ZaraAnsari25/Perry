// Starts packages/optimizer/scripts/run.ts for the trace the dashboard is
// showing and streams its progress log back as plain text. Droid and the
// Factory key stay on the server; one optimize run at a time.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { OPTIMIZE_LOCK as LOCK, REPO, childEnv, measureRunning, optimizeRunning } from "@/lib/child-process";

// serve:patched uses 3002, so the gate's own check server uses 3003.
const CHECK_PORT = "3003";
/** A first attempt plus two retries. */
const MAX_ATTEMPTS = 3;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { benchmark?: unknown; run?: unknown; retryOf?: unknown };
  const args = ["--env-file-if-exists=../../.env", "scripts/run.ts", "--port", CHECK_PORT];
  if (body.benchmark !== undefined) {
    const run = Number(body.run);
    if (typeof body.benchmark !== "string" || !/^(benchmark|compare)-[\w.-]+\.json$/.test(body.benchmark) || !Number.isInteger(run) || run < 1) {
      return new Response("Invalid benchmark or run.\n", { status: 400 });
    }
    args.push("--benchmark", body.benchmark, "--run", String(run));
  }
  if (body.retryOf !== undefined) {
    // Retry a fix that was not accepted: the script tells Droid why it failed.
    const retryOf = body.retryOf;
    if (typeof retryOf !== "string" || !/^data\/results\/patch-[\w.-]+\.json$/.test(retryOf) || !existsSync(join(REPO, retryOf))) {
      return new Response("Invalid fix to retry.\n", { status: 400 });
    }
    const previous = JSON.parse(readFileSync(join(REPO, retryOf), "utf8")) as { status: string; attempt?: number };
    if (previous.status === "accepted") return new Response("That fix was accepted; there is nothing to retry.\n", { status: 400 });
    if ((previous.attempt ?? 1) >= MAX_ATTEMPTS) {
      return new Response(
        `Droid has tried ${MAX_ATTEMPTS} times for this run. Choose an earlier fix instead, or optimize a different run.\n`,
        { status: 409 },
      );
    }
    args.push("--retry-of", retryOf);
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
