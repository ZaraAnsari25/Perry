// CLI-mode shopping agent: the "agent-interface" condition.
//
// Same agent as the browser runner (model, effort, step limit, task, cart
// verifier), but instead of browser tools it gets one sandboxed `bash` tool
// running the store's `shop` commands (@agentfix/agent-interface). The agent
// learns the commands from the guide in its first message. Success is still
// decided by the storefront's backend cart, never by the agent's claim.

import Anthropic from "@anthropic-ai/sdk";

import { createAgentShell, type AgentShell, type ShellResult } from "@agentfix/agent-interface";
import type { AgentTrace, TraceStep } from "@agentfix/shared";
import { verifyCart } from "@agentfix/verifier";

import { DEFAULT_MAX_STEPS, EFFORT, MODEL, costUsd, object } from "./index.ts";

// Kept as close as possible to the browser runner's prompt: only the
// sentences that name the interface differ, and there are no task hints.
const SYSTEM = `You are a shopping assistant working in an online store's agent interface on behalf of a customer.
The store offers a \`shop\` command for finding products and taking actions; the guide below lists its commands.
Use the bash tool to run one command per turn (pipes are allowed).
When the customer's request has been fulfilled, call done. If it cannot be fulfilled, call done and explain why.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "bash",
    description: "Run one bash command in the store's sandboxed shell and get its output.",
    input_schema: object({ command: { type: "string" } }),
    strict: true,
  },
  {
    name: "done",
    description: "Finish the task, with a short summary of what you did.",
    input_schema: object({ summary: { type: "string" } }),
    strict: true,
  },
];

/** pagePath for CLI steps: fixed, so code that reads pagePath keeps working. */
const PAGE_PATH = "cli";

/** Which version of the shop commands a shell runs; optional on AgentShell. */
type ShellImplementation = "handwritten" | "generated";

export interface RunTaskCliInput {
  /** Storefront the `shop` command talks to, e.g. http://localhost:3001 */
  url: string;
  task: string;
  expectedSku: string;
  maxSteps?: number;
}

/** Swappable parts, so tests can run without the API, the sandbox or a storefront. */
export interface RunTaskCliDeps {
  client?: Pick<Anthropic, "messages">;
  createShell?: typeof createAgentShell;
  verify?: typeof verifyCart;
}

/** The tool_result text the agent sees for one command; empty sections are left out. */
export function formatShellResult(r: ShellResult): string {
  return [`exit code: ${r.exitCode}`, r.stdout && `stdout:\n${r.stdout}`, r.stderr && `stderr:\n${r.stderr}`]
    .filter(Boolean)
    .join("\n");
}

export async function runTaskCli(
  { url, task, expectedSku, maxSteps = DEFAULT_MAX_STEPS }: RunTaskCliInput,
  deps: RunTaskCliDeps = {},
): Promise<AgentTrace> {
  // Extra retries so a transient API error (429/5xx) doesn't abort a benchmark.
  const client = deps.client ?? new Anthropic({ maxRetries: 5 });
  const createShell = deps.createShell ?? createAgentShell;
  const verify = deps.verify ?? verifyCart;

  const origin = new URL(url).origin;
  // The run's cart: `shop cart add` writes to it, the verifier reads it back.
  const cartId = crypto.randomUUID();

  const startedAt = new Date().toISOString();
  const runStart = performance.now();
  const sinceStart = () => Math.round(performance.now() - runStart);

  // Building the sandbox is the same for every run; it counts toward total
  // time but is not an agent step (like opening the storefront in a browser run).
  const shell = await createShell({ storeUrl: origin, cartId });
  const implementation =
    (shell as AgentShell & { implementation?: ShellImplementation }).implementation ?? "handwritten";

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Customer request: ${task}\n\n${shell.guide}` }];
  const steps: TraceStep[] = [];
  let agentClaimedDone = false;
  let stopNote: string | undefined;

  for (let index = 0; index < maxSteps; index++) {
    const startMs = sinceStart();

    const modelStart = performance.now();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS,
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      output_config: { effort: EFFORT },
      messages,
    });
    const modelMs = Math.round(performance.now() - modelStart);
    messages.push({ role: "assistant", content: response.content });

    const tokens = {
      inputTokens:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
    };
    const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (!call) {
      stopNote = `Model stopped without an action (stop_reason: ${response.stop_reason})`;
      steps.push({ index, action: "done", pagePath: PAGE_PATH, startMs, browserMs: 0, modelMs, ...tokens, ok: false, error: stopNote });
      break;
    }

    const input = call.input as { command?: string; summary?: string };
    if (call.name === "done") {
      agentClaimedDone = true;
      steps.push({ index, action: "done", target: input.summary, pagePath: PAGE_PATH, startMs, browserMs: 0, modelMs, ...tokens, ok: true });
      break;
    }

    const command = input.command ?? "";
    const execStart = performance.now();
    let result: ShellResult;
    try {
      result = await shell.exec(command);
    } catch (e) {
      // exec() reports command errors as a non-zero exit code; a throw is unexpected.
      // Record it as a failed step and let the agent continue, like a failed browser action.
      const message = (e instanceof Error ? e.message : String(e)).split("\n")[0];
      result = { stdout: "", stderr: `shell error: ${message}`, exitCode: 2, durationMs: Math.round(performance.now() - execStart) };
    }
    const ok = result.exitCode === 0;

    steps.push({
      index,
      action: "shell",
      target: command.slice(0, 200),
      command,
      exitCode: result.exitCode,
      output: (result.stdout || result.stderr).slice(0, 1000),
      pagePath: PAGE_PATH,
      startMs,
      // "Tool time" for CLI runs; meta.interface tells readers which kind it is.
      browserMs: result.durationMs,
      modelMs,
      ...tokens,
      ok,
      ...(ok ? {} : { error: (result.stderr || `exit ${result.exitCode}`).slice(0, 300) }),
    });
    // Any non-zero exit (1 = the agent's mistake, 2 = store unreachable) goes back as an error.
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: call.id,
          content: formatShellResult(result),
          ...(ok ? {} : { is_error: true }),
        },
      ],
    });

    if (index === maxSteps - 1) stopNote = `Reached the ${maxSteps}-step limit`;
  }

  const totalMs = sinceStart();
  const outcome = await verify({ url: origin, cartId, expectedSku, agentClaimedDone });
  if (stopNote && !outcome.reason) outcome.reason = stopNote;

  const sum = (pick: (s: TraceStep) => number) => steps.reduce((total, s) => total + pick(s), 0);
  const inputTokens = sum((s) => s.inputTokens);
  const outputTokens = sum((s) => s.outputTokens);

  return {
    runId: `run-agent-interface-${startedAt.replace(/[:.]/g, "-")}`,
    provenance: "live",
    siteVersion: "agent-interface",
    url: origin,
    task,
    expectedSku,
    model: MODEL,
    startedAt,
    steps,
    metrics: {
      totalMs,
      modelMs: sum((s) => s.modelMs),
      // Shell time only; sandbox setup has no browser equivalent.
      browserMs: sum((s) => s.browserMs),
      inputTokens,
      outputTokens,
      toolCalls: steps.filter((s) => s.action !== "done").length,
      estimatedCostUsd: costUsd(inputTokens, outputTokens),
    },
    outcome,
    meta: { effort: EFFORT, maxSteps: String(maxSteps), cartId, interface: "cli", interfaceImpl: implementation },
  };
}
