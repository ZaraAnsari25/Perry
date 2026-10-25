// generateInterface(): Factory Droid writes this store's `shop` commands from
// the standard contract (packages/agent-interface/CONTRACT.md) by reading the
// store's own code, in a disposable worktree. Perry accepts the result only if
// every gate passes:
//   1. allowlist:    the diff touches only generated/core.ts
//   2. independence: it doesn't import or copy the hand-written core.ts/search.ts
//   3. typecheck:    the repo typechecks with it
//   4. contract:     the search and shop contract tests pass against it (mocked store)
//   5. integration:  with a store URL, a real cart add lands and verifies
// The hand-written core.ts stays the reference and fallback. optimize() and
// DROID_ALLOWED_FILES are untouched; this has its own allowlist.

import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join, posix } from "node:path";
import { promisify } from "node:util";

import { runDroid } from "@agentfix/factory";
import { DROID_PROTECTED_PATHS, type Provenance } from "@agentfix/shared";

import { checkChangedFiles } from "./checks.ts";
import { createWorktree, describeBlocked, git, removeWorktree } from "./index.ts";

const run = promisify(execFile);

const AGENT_INTERFACE = "packages/agent-interface";
export const GENERATED_INTERFACE_FILE = `${AGENT_INTERFACE}/generated/core.ts`;
/** The only file Droid may write when generating the interface. */
export const INTERFACE_ALLOWED_FILES = [GENERATED_INTERFACE_FILE] as const;
/** The hand-written implementation, removed from the worktree while Droid works so it can't be copied. */
export const HANDWRITTEN_FILES = [`${AGENT_INTERFACE}/core.ts`, `${AGENT_INTERFACE}/search.ts`] as const;
/** Longest run of identical significant lines allowed in common with the hand-written files. */
export const MAX_SHARED_RUN = 8;

export interface Gate {
  name: "allowlist" | "independence" | "typecheck" | "contract tests" | "integration";
  ok: boolean;
  detail: string;
  /** Not run: an earlier gate failed, or (integration) no store URL was given. */
  skipped?: boolean;
}

export interface InterfaceGenResult {
  provenance: Provenance;
  status: "accepted" | "rejected" | "failed";
  gates: Gate[];
  droidSessionId?: string;
  createdAt: string;
  baseCommit: string;
  /** What Droid said it did. */
  explanation: string;
  /** Requests the permission handler refused. */
  blocked: string[];
  reason?: string;
  /** The generated file, when Droid wrote one. */
  source?: string;
}

export interface GenerateOptions {
  repoPath: string;
  baseRef?: string;
  sandboxRoot?: string;
  /** Running store for the integration gate; skipped without one. */
  storeUrl?: string;
  log?: (line: string) => void;
  /** Keep the worktree afterwards (default: delete it). */
  keepWorktree?: boolean;
  /** Why the last attempt wasn't accepted, told to Droid. */
  feedback?: string;
  /** Writes a scripted file instead of running Droid, to test the gates. Marks the result "fixture". */
  simulatedOutput?: { description: string; apply: (worktree: string) => Promise<void> };
}

export function interfacePrompt(contract: string, feedback?: string): string {
  return [
    "You are writing the agent interface for this online store: the `shop` command that AI agents use instead of the website.",
    "Below is Perry's standard contract for it. Implement exactly this behavior for this store.",
    "",
    "Read apps/storefront/lib/catalog.ts and apps/storefront/app/api/cart/route.ts to learn this store's data and cart API.",
    `Write ${GENERATED_INTERFACE_FILE} exporting runShop(args, { storeUrl, cartId }) with exactly the behavior in the contract.`,
    'You may import the catalog read-only: import { catalog, findVariant, getProduct, type Product } from "../../../apps/storefront/lib/catalog.ts";',
    "Do not import or copy packages/agent-interface/core.ts or search.ts, or anything else from packages/agent-interface.",
    "Use only the global fetch and Node built-ins; add no dependencies.",
    "The file runs directly under Node 22 type stripping and the repo's strict tsconfig: no enums, namespaces or parameter properties; import paths end in .ts; use `import type` (or inline `type`) for type-only imports.",
    `You can only create ${GENERATED_INTERFACE_FILE}. Every other edit and every shell command is blocked.`,
    "Perry then checks it: allowed file only, no copying, typecheck, and the contract tests in packages/agent-interface/search.test.ts and shop.test.ts (run with SHOP_IMPL=generated, store mocked through globalThis.fetch).",
    ...(feedback ? ["", "A previous attempt was not accepted:", feedback, "Fix that this time. All the rules above still apply."] : []),
    "",
    "----- CONTRACT.md -----",
    contract,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Gates (pure where possible, so they're unit-tested)
// ---------------------------------------------------------------------------

/** Module specifiers a source file imports or re-exports. */
function specifiers(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) out.push(m[1]!);
  return out;
}

/** A bare field declaration such as `priceUsd: number;`: the contract dictates these, so they carry no copied logic. */
const FIELD_DECLARATION = /^(readonly )?[\w$]+\??: [\w$<>[\]|." ]+[;,]?$/;

/**
 * Significant lines for the copy check: trimmed, whitespace collapsed, without
 * blanks, comments, short lines or bare field declarations.
 */
function significant(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l.length >= 12 && !/^(\/\/|\/\*|\*)/.test(l) && !FIELD_DECLARATION.test(l));
}

function longestSharedRun(a: string[], b: string[]): number {
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1]! + 1;
        if (cur[j]! > best) best = cur[j]!;
      }
    }
    prev = cur;
  }
  return best;
}

/** Doesn't import the hand-written implementation, and isn't a near-copy of it. */
export function checkIndependence(source: string, handwritten: { path: string; text: string }[]): { ok: boolean; detail: string } {
  const here = posix.dirname(GENERATED_INTERFACE_FILE);
  const forbidden = specifiers(source).filter((s) => {
    if (s === "@agentfix/agent-interface" || s.startsWith("@agentfix/agent-interface/")) return true;
    if (!s.startsWith(".")) return false;
    const target = posix.normalize(posix.join(here, s));
    return target.startsWith(`${AGENT_INTERFACE}/`) && !target.startsWith(`${here}/`);
  });
  if (forbidden.length > 0) return { ok: false, detail: `Imports the hand-written interface: ${forbidden.join(", ")}` };

  const mine = significant(source);
  const runs = handwritten.map((h) => ({ path: h.path, run: longestSharedRun(mine, significant(h.text)) }));
  const worst = runs.reduce((a, b) => (b.run > a.run ? b : a), { path: "", run: 0 });
  if (worst.run >= MAX_SHARED_RUN)
    return { ok: false, detail: `Copies ${worst.run} consecutive lines from ${worst.path} (limit ${MAX_SHARED_RUN - 1}).` };
  return {
    ok: true,
    detail: `No imports from the hand-written interface; longest run of lines shared with it: ${worst.run} (limit ${MAX_SHARED_RUN - 1}).`,
  };
}

/** Environment for a child `node --test` run; drops the parent runner's context so it runs normally. */
function testEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** Summarizes node --test output: counts and the names of failing tests. */
function summarizeTests(output: string): { pass: number; fail: number; failing: string[] } {
  const num = (name: string) => Number(new RegExp(`^# ${name} (\\d+)`, "m").exec(output)?.[1] ?? 0);
  const failing = [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]!).filter((n) => !n.endsWith(".ts"));
  return { pass: num("pass"), fail: num("fail"), failing: [...new Set(failing)] };
}

/**
 * Runs the contract tests (search and shop) against an implementation:
 * "generated" or a path to any file exporting runShop. The store is mocked; no network.
 */
export async function runContractGate(interfaceDir: string, impl: string): Promise<{ ok: boolean; detail: string }> {
  const env = testEnv({ SHOP_IMPL: impl });
  delete env.STORE_URL;
  const out = await run(process.execPath, ["--test", "--test-reporter=tap", "search.test.ts", "shop.test.ts"], {
    cwd: interfaceDir,
    env,
    maxBuffer: 64 << 20,
    timeout: 300_000,
  }).then(
    (r) => ({ text: r.stdout + r.stderr, code: 0 }),
    (e: { stdout?: string; stderr?: string; code?: number }) => ({ text: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.code ?? 1 }),
  );
  const t = summarizeTests(out.text);
  if (out.code === 0 && t.fail === 0 && t.pass > 0) return { ok: true, detail: `All ${t.pass} contract tests pass.` };
  if (t.pass + t.fail === 0) return { ok: false, detail: `The tests didn't run: ${out.text.trim().split("\n").slice(-3).join(" ")}` };
  return { ok: false, detail: `${t.fail} of ${t.pass + t.fail} contract tests failed: ${t.failing.join("; ")}` };
}

/** The integration test against a running store: a real add lands, refusals don't change the cart, verifyCart succeeds. */
export async function runIntegrationGate(interfaceDir: string, impl: string, storeUrl: string): Promise<{ ok: boolean; detail: string }> {
  const env = testEnv({ SHOP_IMPL: impl, STORE_URL: storeUrl });
  const out = await run(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern=integration", "shop.test.ts"], {
    cwd: interfaceDir,
    env,
    maxBuffer: 16 << 20,
    timeout: 120_000,
  }).then(
    (r) => ({ text: r.stdout + r.stderr, code: 0 }),
    (e: { stdout?: string; stderr?: string; code?: number }) => ({ text: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.code ?? 1 }),
  );
  const t = summarizeTests(out.text);
  return out.code === 0 && t.pass === 1 && t.fail === 0
    ? { ok: true, detail: `Bought VEL-BLK-08 on the real cart at ${storeUrl}; refusals left it unchanged; verifyCart succeeded.` }
    : { ok: false, detail: `Failed against ${storeUrl}: ${t.failing.join("; ") || out.text.trim().split("\n").slice(-3).join(" ")}` };
}

// ---------------------------------------------------------------------------
// The generation run
// ---------------------------------------------------------------------------

const GATE_ORDER: Gate["name"][] = ["allowlist", "independence", "typecheck", "contract tests", "integration"];

export async function generateInterface(options: GenerateOptions): Promise<InterfaceGenResult> {
  const log = options.log ?? (() => {});
  const createdAt = new Date().toISOString();
  const { worktree, baseCommit } = await createWorktree(options.repoPath, `interface-${createdAt.replace(/[:.]/g, "-")}`, {
    baseRef: options.baseRef,
    sandboxRoot: options.sandboxRoot,
  });
  log(`worktree: ${worktree} @ ${baseCommit.slice(0, 7)}`);

  const gates: Gate[] = [];
  const result: InterfaceGenResult = {
    provenance: options.simulatedOutput ? "fixture" : "live",
    status: "failed",
    gates,
    createdAt,
    baseCommit,
    explanation: "",
    blocked: [],
  };
  const pass = (name: Gate["name"], detail: string) => {
    gates.push({ name, ok: true, detail });
    log(`${name}: pass (${detail})`);
  };
  const finish = (status: "rejected" | "failed", reason: string, failedGate?: Gate["name"]): InterfaceGenResult => {
    if (failedGate) gates.push({ name: failedGate, ok: false, detail: reason });
    for (const name of GATE_ORDER.slice(gates.length))
      gates.push({ name, ok: false, skipped: true, detail: "Not run: an earlier check failed." });
    log(`${status}: ${reason}`);
    return Object.assign(result, { status, reason });
  };

  try {
    const contract = await readFile(join(worktree, AGENT_INTERFACE, "CONTRACT.md"), "utf8");
    const handwritten = await Promise.all(
      HANDWRITTEN_FILES.map(async (path) => ({ path, text: await readFile(join(worktree, path), "utf8") })),
    );

    // Droid works without the hand-written implementation in its folder.
    for (const path of HANDWRITTEN_FILES) await rm(join(worktree, path));
    if (options.simulatedOutput) {
      log(`applying scripted output (not Droid): ${options.simulatedOutput.description}`);
      await options.simulatedOutput.apply(worktree);
      result.explanation = `Scripted output, not generated by Droid: ${options.simulatedOutput.description}`;
    } else {
      log("running Factory Droid...");
      const droid = await runDroid({
        cwd: worktree,
        prompt: interfacePrompt(contract, options.feedback),
        allowedFiles: INTERFACE_ALLOWED_FILES,
        onEvent: log,
      });
      result.droidSessionId = droid.sessionId || undefined;
      result.explanation = droid.text.trim();
      result.blocked = droid.denied;
      if (droid.denied.length > 0) log(`permission handler blocked: ${droid.denied.join("; ")}`);
      if (!droid.success) return finish("failed", `Droid did not finish: ${droid.error ?? droid.subtype}`);
    }
    await git(worktree, "checkout", baseCommit, "--", ...HANDWRITTEN_FILES);

    // 1. Allowlist.
    await git(worktree, "add", "--intent-to-add", "--all");
    const changed = (await git(worktree, "diff", "--name-only", baseCommit)).split("\n").filter(Boolean);
    if (changed.length === 0)
      return finish(
        "rejected",
        result.blocked.length > 0
          ? `Droid wrote nothing: Perry blocked ${result.blocked.map(describeBlocked).join("; ")}.`
          : "Droid finished without writing the file.",
        "allowlist",
      );
    const allowlist = checkChangedFiles(changed, INTERFACE_ALLOWED_FILES, DROID_PROTECTED_PATHS);
    if (!allowlist.ok) return finish("rejected", allowlist.problems.join(" "), "allowlist");
    if (!changed.includes(GENERATED_INTERFACE_FILE)) return finish("rejected", `${GENERATED_INTERFACE_FILE} was not written.`, "allowlist");
    pass("allowlist", `Only ${GENERATED_INTERFACE_FILE} changed.`);
    result.source = await readFile(join(worktree, GENERATED_INTERFACE_FILE), "utf8");

    // 2. Independence.
    const independence = checkIndependence(result.source, handwritten);
    if (!independence.ok) return finish("rejected", independence.detail, "independence");
    pass("independence", independence.detail);

    // 3. Typecheck.
    log("installing dependencies and typechecking...");
    try {
      await run("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], { cwd: worktree, maxBuffer: 64 << 20 });
      await run(join(worktree, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], { cwd: worktree, maxBuffer: 16 << 20 });
    } catch (error) {
      const out = error as { stdout?: string; stderr?: string };
      return finish("rejected", `Typecheck failed: ${`${out.stdout ?? ""}${out.stderr ?? ""}`.trim().slice(0, 1500)}`, "typecheck");
    }
    pass("typecheck", "The repo typechecks with the generated file.");

    // 4. Contract tests, store mocked.
    log("running the contract tests against the generated runShop...");
    const interfaceDir = join(worktree, AGENT_INTERFACE);
    const contractGate = await runContractGate(interfaceDir, "generated");
    if (!contractGate.ok) return finish("rejected", contractGate.detail, "contract tests");
    pass("contract tests", contractGate.detail);

    // 5. Integration against a running store.
    if (options.storeUrl) {
      log(`integration test against ${options.storeUrl}...`);
      const integration = await runIntegrationGate(interfaceDir, "generated", options.storeUrl);
      if (!integration.ok) return finish("rejected", integration.detail, "integration");
      pass("integration", integration.detail);
    } else {
      gates.push({ name: "integration", ok: true, skipped: true, detail: "Skipped: no store URL given." });
      log("integration: skipped (no store URL)");
    }

    result.status = "accepted";
    log("accepted");
    return result;
  } finally {
    if (!options.keepWorktree) {
      await removeWorktree(options.repoPath, worktree).catch(() => {});
      log(`removed worktree: ${worktree}`);
    }
  }
}
