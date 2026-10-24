// Starts packages/optimizer/scripts/run.ts for the trace the dashboard is
// showing and streams its progress log back as plain text. Droid and the
// Factory key stay on the server; one optimize run at a time.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// next dev/build/start run with the dashboard app as the working directory.
const REPO = join(process.cwd(), "../..");
const LOCK = join(REPO, "data/results/.optimize-running");
// serve:patched uses 3002, so the gate's own check server uses 3003.
const CHECK_PORT = "3003";

function alreadyRunning(): boolean {
  if (!existsSync(LOCK)) return false;
  try {
    process.kill(Number(readFileSync(LOCK, "utf8")), 0);
    return true;
  } catch {
    rmSync(LOCK, { force: true });
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { benchmark?: unknown; run?: unknown };
  const args = ["--env-file-if-exists=../../.env", "scripts/run.ts", "--port", CHECK_PORT];
  if (body.benchmark !== undefined) {
    const run = Number(body.run);
    if (typeof body.benchmark !== "string" || !/^benchmark-[\w.-]+\.json$/.test(body.benchmark) || !Number.isInteger(run) || run < 1) {
      return new Response("Invalid benchmark or run.\n", { status: 400 });
    }
    args.push("--benchmark", body.benchmark, "--run", String(run));
  }
  if (alreadyRunning()) {
    return new Response("An optimize run is already in progress.\n", { status: 409 });
  }

  // Don't pass the dashboard's own Next.js settings (NODE_ENV=development under
  // next dev, internal __NEXT_* flags) to the patched storefront's build.
  // NODE_ENV stays unset on purpose: NODE_ENV=production would make `npm ci`
  // skip devDependencies.
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "NODE_ENV" || /^(__NEXT|NEXT_|TURBOPACK)/.test(key)) delete env[key];
  }
  // The Droid SDK starts the droid CLI from PATH.
  env.PATH = `${join(homedir(), ".local/bin")}:${process.env.PATH ?? ""}`;
  const child = spawn(process.execPath, args, {
    cwd: join(REPO, "packages/optimizer"),
    env: env as NodeJS.ProcessEnv,
  });
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
