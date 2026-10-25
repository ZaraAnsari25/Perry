// Unit tests for the CLI-mode runner. Fake shell, fake model, fake verifier:
// no API calls, no sandbox, no storefront.

import assert from "node:assert/strict";
import { test } from "node:test";

import type Anthropic from "@anthropic-ai/sdk";
import type { AgentShell, ShellResult } from "@agentfix/agent-interface";
import type { VerifiedOutcome } from "@agentfix/shared";

import { formatShellResult, runTaskCli, type RunTaskCliDeps } from "./cli.ts";

const TASK = "Find a black running shoe under $120 in size 8 that is in stock, and add it to my cart.";
const GUIDE = "# Shop commands\nshop search [--color C] [--size N] ...";

type Call = { name: "bash"; command: string } | { name: "done"; summary: string } | { name: "none" };

/** A fake model that plays back `calls` in order and records the messages it was sent. */
function fakeClient(calls: Call[]) {
  const sent: Anthropic.MessageParam[][] = [];
  let i = 0;
  const client = {
    messages: {
      create: async (params: { messages: Anthropic.MessageParam[] }) => {
        sent.push(JSON.parse(JSON.stringify(params.messages)));
        const call = calls.at(i++);
        const content =
          !call || call.name === "none"
            ? [{ type: "text", text: "I'm not sure." }]
            : [
                {
                  type: "tool_use",
                  id: `tool-${i}`,
                  name: call.name,
                  input: call.name === "bash" ? { command: call.command } : { summary: call.summary },
                },
              ];
        return {
          content,
          stop_reason: call && call.name !== "none" ? "tool_use" : "end_turn",
          usage: { input_tokens: 100, output_tokens: 10 },
        };
      },
    },
  } as unknown as NonNullable<RunTaskCliDeps["client"]>;
  return { client, sent };
}

/** A fake shell: answers known commands, fails unknown ones the way bash does. */
function fakeShell(answers: Record<string, Partial<ShellResult> | Error>, implementation?: "handwritten" | "generated") {
  const created: { storeUrl: string; cartId: string }[] = [];
  const createShell = (async (input: { storeUrl: string; cartId: string }) => {
    created.push(input);
    const shell: AgentShell & { implementation?: string } = {
      guide: GUIDE,
      exec: async (command: string) => {
        const answer = answers[command];
        if (answer instanceof Error) throw answer;
        return {
          stdout: "",
          stderr: answer ? "" : `bash: ${command}: command not found`,
          exitCode: answer ? 0 : 127,
          durationMs: 5,
          ...answer,
        };
      },
      ...(implementation ? { implementation } : {}),
    };
    return shell;
  }) as NonNullable<RunTaskCliDeps["createShell"]>;
  return { createShell, created };
}

function fakeVerify(success: boolean) {
  const calls: Parameters<NonNullable<RunTaskCliDeps["verify"]>>[0][] = [];
  const verify = async (input: (typeof calls)[number]): Promise<VerifiedOutcome> => {
    calls.push(input);
    return {
      success,
      agentClaimedDone: input.agentClaimedDone,
      cart: success ? [{ sku: input.expectedSku, quantity: 1 }] : [],
      ...(success ? {} : { reason: "Cart is empty" }),
    };
  };
  return { verify, calls };
}

const SEARCH = "shop search --color black --category running --max-price 120 --size 8 --in-stock";
const SHOP_ANSWERS = {
  [SEARCH]: { stdout: "1 match: VEL-BLK-08 Velocity Runner, black, running, $98, size 8, stock 3" },
  "shop cart add TMP-BLK-08": { stderr: "TMP-BLK-08 (Tempo Lite, size 8) is sold out. Cart unchanged.", exitCode: 1 },
  "shop cart add VEL-BLK-08": { stdout: "Added VEL-BLK-08 (Velocity Runner, size 8)." },
};

test("bash calls become shell steps and done ends a verified run", async () => {
  const { client, sent } = fakeClient([
    { name: "bash", command: SEARCH },
    { name: "bash", command: "shop cart add TMP-BLK-08" },
    { name: "bash", command: "shop cart add VEL-BLK-08" },
    { name: "done", summary: "Added the Velocity Runner in size 8." },
  ]);
  const { createShell, created } = fakeShell(SHOP_ANSWERS);
  const { verify, calls } = fakeVerify(true);

  const trace = await runTaskCli(
    { url: "http://localhost:3001/search", task: TASK, expectedSku: "VEL-BLK-08" },
    { client, createShell, verify },
  );

  assert.deepEqual(trace.steps.map((s) => s.action), ["shell", "shell", "shell", "done"]);
  const [search, soldOut, add, done] = trace.steps;
  assert.equal(search?.command, SEARCH);
  assert.equal(search?.target, SEARCH);
  assert.equal(search?.exitCode, 0);
  assert.equal(search?.ok, true);
  assert.match(search?.output ?? "", /VEL-BLK-08/);
  assert.equal(search?.pagePath, "cli");

  assert.equal(soldOut?.ok, false);
  assert.equal(soldOut?.exitCode, 1);
  assert.match(soldOut?.error ?? "", /sold out/);
  assert.match(soldOut?.output ?? "", /sold out/);
  assert.equal(add?.ok, true);
  assert.equal(done?.ok, true);
  assert.equal(done?.target, "Added the Velocity Runner in size 8.");

  // The shell and the verifier share the run's cart, on the store's origin.
  assert.equal(created.length, 1);
  assert.equal(created[0]?.storeUrl, "http://localhost:3001");
  assert.equal(calls[0]?.cartId, created[0]?.cartId);
  assert.equal(calls[0]?.url, "http://localhost:3001");
  assert.equal(calls[0]?.agentClaimedDone, true);
  assert.equal(trace.meta?.cartId, created[0]?.cartId);

  // The agent saw the task and the guide first, and the failed command flagged as an error.
  assert.equal(sent[0]?.[0]?.content, `Customer request: ${TASK}\n\n${GUIDE}`);
  const afterSoldOut = sent[2]?.at(-1)?.content as Anthropic.ToolResultBlockParam[];
  assert.equal(afterSoldOut[0]?.is_error, true);
  assert.match(String(afterSoldOut[0]?.content), /^exit code: 1\nstderr:\nTMP-BLK-08 \(Tempo Lite, size 8\) is sold out/);
  const afterSearch = sent[1]?.at(-1)?.content as Anthropic.ToolResultBlockParam[];
  assert.equal(afterSearch[0]?.is_error, undefined);

  assert.equal(trace.siteVersion, "agent-interface");
  assert.equal(trace.provenance, "live");
  assert.match(trace.runId, /^run-agent-interface-/);
  assert.equal(trace.meta?.interface, "cli");
  assert.equal(trace.meta?.interfaceImpl, "handwritten");
  assert.equal(trace.metrics.toolCalls, 3);
  assert.equal(trace.metrics.inputTokens, 400);
  assert.equal(trace.metrics.outputTokens, 40);
  assert.equal(trace.metrics.browserMs, 15);
  assert.equal(trace.outcome.success, true);
});

test("the shell's implementation is recorded when it reports one", async () => {
  const { client } = fakeClient([{ name: "done", summary: "Nothing to do." }]);
  const { createShell } = fakeShell({}, "generated");
  const { verify } = fakeVerify(false);

  const trace = await runTaskCli({ url: "http://localhost:3001", task: TASK, expectedSku: "VEL-BLK-08" }, { client, createShell, verify });

  assert.equal(trace.meta?.interfaceImpl, "generated");
});

test("an unreachable store (exit 2) is a failed step sent back as an error", async () => {
  const { client, sent } = fakeClient([
    { name: "bash", command: "shop cart add VEL-BLK-08" },
    { name: "done", summary: "The store could not be reached." },
  ]);
  const { createShell } = fakeShell({ "shop cart add VEL-BLK-08": { stderr: "Store unreachable.", exitCode: 2 } });
  const { verify } = fakeVerify(false);

  const trace = await runTaskCli({ url: "http://localhost:3001", task: TASK, expectedSku: "VEL-BLK-08" }, { client, createShell, verify });

  assert.equal(trace.steps[0]?.ok, false);
  assert.equal(trace.steps[0]?.exitCode, 2);
  const result = sent[1]?.at(-1)?.content as Anthropic.ToolResultBlockParam[];
  assert.equal(result[0]?.is_error, true);
  assert.equal(trace.outcome.success, false);
});

test("a model that stops without a tool call ends the run unverified", async () => {
  const { client } = fakeClient([{ name: "none" }]);
  const { createShell } = fakeShell({});
  const { verify, calls } = fakeVerify(false);

  const trace = await runTaskCli({ url: "http://localhost:3001", task: TASK, expectedSku: "VEL-BLK-08" }, { client, createShell, verify });

  assert.equal(trace.steps.length, 1);
  assert.equal(trace.steps[0]?.action, "done");
  assert.equal(trace.steps[0]?.ok, false);
  assert.match(trace.steps[0]?.error ?? "", /without an action/);
  assert.equal(calls[0]?.agentClaimedDone, false);
  assert.equal(trace.metrics.toolCalls, 0);
  assert.equal(trace.outcome.success, false);
});

test("a throwing shell becomes a failed step and the run continues", async () => {
  const { client } = fakeClient([
    { name: "bash", command: "boom" },
    { name: "bash", command: "shop cart add VEL-BLK-08" },
    { name: "done", summary: "Done." },
  ]);
  const { createShell } = fakeShell({ ...SHOP_ANSWERS, boom: new Error("sandbox crashed\nstack") });
  const { verify } = fakeVerify(true);

  const trace = await runTaskCli({ url: "http://localhost:3001", task: TASK, expectedSku: "VEL-BLK-08" }, { client, createShell, verify });

  assert.deepEqual(trace.steps.map((s) => s.ok), [false, true, true]);
  assert.equal(trace.steps[0]?.error, "shell error: sandbox crashed");
});

test("the step limit stops the run", async () => {
  const { client } = fakeClient(Array.from({ length: 5 }, () => ({ name: "bash", command: "shop help" }) as Call));
  const { createShell } = fakeShell({ "shop help": { stdout: "usage: shop <command>" } });
  const { verify } = fakeVerify(false);

  const trace = await runTaskCli(
    { url: "http://localhost:3001", task: TASK, expectedSku: "VEL-BLK-08", maxSteps: 3 },
    { client, createShell, verify },
  );

  assert.equal(trace.steps.length, 3);
  assert.equal(trace.outcome.success, false);
});

test("formatShellResult leaves out empty sections", () => {
  assert.equal(formatShellResult({ stdout: "hi", stderr: "", exitCode: 0, durationMs: 1 }), "exit code: 0\nstdout:\nhi");
  assert.equal(formatShellResult({ stdout: "", stderr: "", exitCode: 2, durationMs: 1 }), "exit code: 2");
});
