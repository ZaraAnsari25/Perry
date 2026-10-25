// A fresh sandboxed shell for one agent run, with `shop` as its only store access.
// No files, no real shell, no network, no JavaScript or Python.

import { Bash } from "just-bash";

import { catalog } from "../../apps/storefront/lib/catalog.ts";
import { buildGuide } from "./guide.ts";
import { createShopCommand } from "./shop.ts";

export const MAX_OUTPUT_CHARS = 8000;

const TRUNCATION_NOTE = `\n[output truncated at ${MAX_OUTPUT_CHARS} characters; narrow your search with more flags or --limit]`;

const truncate = (text: string) =>
  text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) + TRUNCATION_NOTE : text;

export interface ShellResult {
  /** Truncated to MAX_OUTPUT_CHARS, ending with a truncation note if cut. */
  stdout: string;
  /** Truncated the same way. */
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface AgentShell {
  /** The guide text (buildGuide output), for the agent's first message. */
  guide: string;
  /** Run one command. Never throws for command errors; returns a non-zero exitCode instead. */
  exec(command: string): Promise<ShellResult>;
}

/** A fresh sandbox for ONE agent run. */
export async function createAgentShell({ storeUrl, cartId }: { storeUrl: string; cartId: string }): Promise<AgentShell> {
  const bash = new Bash({
    cwd: "/home/agent",
    customCommands: [createShopCommand({ storeUrl, cartId })],
    executionLimitProfile: "hardened",
    executionLimits: { maxExecutionTimeMs: 10_000 },
    // No `files`, `network`, `javascript` or `python`: keep them all off.
  });
  return {
    guide: buildGuide(catalog),
    async exec(command) {
      const start = performance.now();
      const durationMs = () => Math.round(performance.now() - start);
      try {
        const r = await bash.exec(command);
        return { stdout: truncate(r.stdout), stderr: truncate(r.stderr), exitCode: r.exitCode, durationMs: durationMs() };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { stdout: "", stderr: `shell error: ${message}`, exitCode: 1, durationMs: durationMs() };
      }
    },
  };
}
