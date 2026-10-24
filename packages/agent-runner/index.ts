// Browser shopping agent: implements RunTask.
//
// Each step, Claude sees the current page as an accessibility outline and picks
// exactly one browser action; Playwright performs it. Model time, browser time
// and token usage are recorded per step. Success is decided afterwards by the
// verifier reading the storefront's backend cart, never by the agent's claim.
//
// The model, effort, system prompt and tools are identical for every run, so
// baseline and patched results differ only by the website.

import Anthropic from "@anthropic-ai/sdk";
import { chromium, type Locator, type Page } from "playwright";

import type { AgentTrace, RunTask, StepAction, TraceStep } from "@agentfix/shared";
import { verifyCart } from "@agentfix/verifier";

export const MODEL = "claude-haiku-5-5";
export const EFFORT = "medium";
/**
 * Claude Haiku 5.5 list price, USD per million tokens, for prompts up to 100K
 * tokens (this agent's prompts stay well below that).
 */
export const PRICE_PER_MTOK = { input: 0.1, output: 0.5 };
export const DEFAULT_MAX_STEPS = 25;

const CART_COOKIE = "cart_id";
const ACTION_TIMEOUT_MS = 10_000;

const SYSTEM = `You are a shopping assistant operating a web browser in an online store on behalf of a customer.
Each turn you see the current page as an accessibility outline in which elements have refs such as [ref=e12].
Take exactly one action per turn using the tools, referring to elements only by refs from the most recent outline.
When the customer's request has been fulfilled, call done. If it cannot be fulfilled, call done and explain why.`;

const object = (properties: Record<string, unknown>) => ({
  type: "object" as const,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const ref = { type: "string", description: "Element ref from the latest page outline, e.g. e12" };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "navigate",
    description: "Open a path on this store, e.g. /cart.",
    input_schema: object({ path: { type: "string", description: "Path starting with /" } }),
    strict: true,
  },
  {
    name: "click",
    description: "Click a link or button.",
    input_schema: object({ ref }),
    strict: true,
  },
  {
    name: "type",
    description: "Type text into an input field. Set submit to true to press Enter afterwards.",
    input_schema: object({ ref, text: { type: "string" }, submit: { type: "boolean" } }),
    strict: true,
  },
  {
    name: "select",
    description: "Choose an option in a dropdown by its visible label.",
    input_schema: object({ ref, option: { type: "string" } }),
    strict: true,
  },
  {
    name: "done",
    description: "Finish the task, with a short summary of what you did.",
    input_schema: object({ summary: { type: "string" } }),
    strict: true,
  },
];

const ACTIONS: Record<string, StepAction> = {
  navigate: "navigate",
  click: "click",
  type: "type",
  select: "select",
  done: "done",
};

type ToolInput = {
  path?: string;
  ref?: string;
  text?: string;
  submit?: boolean;
  option?: string;
  summary?: string;
};

const pathOf = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};

/** The page as the model sees it. Exported for tests. */
export async function observe(page: Page): Promise<string> {
  await page.waitForLoadState("domcontentloaded");
  return `Page: ${pathOf(page)}\n\n${await page.ariaSnapshot({ mode: "ai" })}`;
}

/**
 * Human-readable label for the trace, e.g. `link "View details" -> /products/tempo-lite`.
 * Read from the outline the model just saw: taking a new snapshot would
 * invalidate the refs the model chose.
 */
async function describe(el: Locator, ref: string | undefined, observation: string): Promise<string> {
  const line = observation.split("\n").find((l) => l.includes(`[ref=${ref}]`)) ?? `ref ${ref}`;
  const label = line
    .trim()
    .replace(/^- /, "")
    .replace(/ \[(ref|cursor|active)[^\]]*\]/g, "")
    .replace(/:$/, "");
  const href = await el.getAttribute("href", { timeout: ACTION_TIMEOUT_MS });
  return href ? `${label} -> ${href}` : label;
}

/** Performs one tool call in the browser and returns the trace target. Exported for tests. */
export async function perform(
  page: Page,
  origin: string,
  name: string,
  input: ToolInput,
  observation: string,
): Promise<string> {
  const el = () => page.locator(`aria-ref=${input.ref}`);
  const label = () => describe(el(), input.ref, observation);
  switch (name) {
    case "navigate": {
      const url = new URL(input.path ?? "/", origin);
      if (url.origin !== origin) throw new Error(`Only ${origin} is allowed`);
      await page.goto(url.href);
      return url.pathname + url.search;
    }
    case "click": {
      const target = await label();
      const href = await el().getAttribute("href", { timeout: ACTION_TIMEOUT_MS });
      const before = page.url();
      await el().click({ timeout: ACTION_TIMEOUT_MS });
      // Next.js links navigate client-side: wait for the new page before observing.
      if (href) await page.waitForURL((u) => u.href !== before, { timeout: ACTION_TIMEOUT_MS }).catch(() => {});
      return target;
    }
    case "type": {
      const target = `${await label()}: ${input.text}`;
      await el().fill(input.text ?? "", { timeout: ACTION_TIMEOUT_MS });
      if (input.submit) await el().press("Enter", { timeout: ACTION_TIMEOUT_MS });
      return target;
    }
    case "select": {
      const target = `${await label()}: ${input.option}`;
      await el().selectOption({ label: input.option ?? "" }, { timeout: ACTION_TIMEOUT_MS });
      return target;
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

const costUsd = (inputTokens: number, outputTokens: number) =>
  Number(
    ((inputTokens * PRICE_PER_MTOK.input + outputTokens * PRICE_PER_MTOK.output) / 1_000_000).toFixed(6),
  );

export const runTask: RunTask = async ({ url, task, expectedSku, siteVersion, maxSteps = DEFAULT_MAX_STEPS }) => {
  const client = new Anthropic();
  const origin = new URL(url).origin;
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });

  try {
    const context = await browser.newContext();
    // Keep the agent on the storefront under test.
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const page = await context.newPage();

    const startedAt = new Date().toISOString();
    const runStart = performance.now();
    const sinceStart = () => Math.round(performance.now() - runStart);

    await page.goto(origin);
    const firstObservation = await observe(page);
    let lastObservation = firstObservation;
    // Opening the storefront is the same for every run; it counts toward
    // browser and total time but is not an agent step.
    const initialLoadMs = sinceStart();

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Customer request: ${task}\n\n${firstObservation}` },
    ];
    const steps: TraceStep[] = [];
    let agentClaimedDone = false;
    let stopNote: string | undefined;

    for (let index = 0; index < maxSteps; index++) {
      const startMs = sinceStart();
      const pagePath = new URL(page.url()).pathname;

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
        steps.push({ index, action: "done", pagePath, startMs, browserMs: 0, modelMs, ...tokens, ok: false, error: stopNote });
        break;
      }

      const input = call.input as ToolInput;
      if (call.name === "done") {
        agentClaimedDone = true;
        steps.push({ index, action: "done", target: input.summary, pagePath, startMs, browserMs: 0, modelMs, ...tokens, ok: true });
        break;
      }

      const browserStart = performance.now();
      let target: string | undefined = input.ref ?? input.path;
      let error: string | undefined;
      try {
        target = await perform(page, origin, call.name, input, lastObservation);
      } catch (e) {
        error = (e instanceof Error ? e.message : String(e)).split("\n")[0];
      }
      const observation = await observe(page);
      lastObservation = observation;
      const browserMs = Math.round(performance.now() - browserStart);

      steps.push({
        index,
        action: ACTIONS[call.name] ?? "observe",
        target,
        pagePath,
        startMs,
        browserMs,
        modelMs,
        ...tokens,
        ok: !error,
        ...(error ? { error } : {}),
      });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: call.id,
            content: error ? `Action failed: ${error}\n\n${observation}` : observation,
            ...(error ? { is_error: true } : {}),
          },
        ],
      });

      if (index === maxSteps - 1) stopNote = `Reached the ${maxSteps}-step limit`;
    }

    const totalMs = sinceStart();
    const cartId = (await context.cookies(origin)).find((c) => c.name === CART_COOKIE)?.value;
    const outcome = await verifyCart({ url: origin, cartId, expectedSku, agentClaimedDone });
    if (stopNote && !outcome.reason) outcome.reason = stopNote;

    const sum = (pick: (s: TraceStep) => number) => steps.reduce((total, s) => total + pick(s), 0);
    const inputTokens = sum((s) => s.inputTokens);
    const outputTokens = sum((s) => s.outputTokens);

    const trace: AgentTrace = {
      runId: `run-${siteVersion}-${startedAt.replace(/[:.]/g, "-")}`,
      provenance: "live",
      siteVersion,
      url: origin,
      task,
      expectedSku,
      model: MODEL,
      startedAt,
      steps,
      metrics: {
        totalMs,
        modelMs: sum((s) => s.modelMs),
        browserMs: initialLoadMs + sum((s) => s.browserMs),
        inputTokens,
        outputTokens,
        toolCalls: steps.filter((s) => s.action !== "done").length,
        estimatedCostUsd: costUsd(inputTokens, outputTokens),
      },
      outcome,
      meta: { effort: EFFORT, maxSteps: String(maxSteps), ...(cartId ? { cartId } : {}) },
    };
    return trace;
  } finally {
    await browser.close();
  }
};
