// optimize(): diagnose a trace, have Factory Droid patch the storefront in a
// disposable git worktree, and accept the patch only if every gate passes:
//   1. allowlist: the diff touches only allowed files, never protected paths
//   2. build:     the patched storefront builds
//   3. tests:     the served search pages show the same products in the same
//                 order as the baseline, and no card contradicts the catalog

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { diagnose } from "@agentfix/diagnosis";
import { runDroid } from "@agentfix/factory";
import { DROID_ALLOWED_FILES, DROID_PROTECTED_PATHS } from "@agentfix/shared";
import type { Finding, OptimizeInput, PatchResult } from "@agentfix/shared";

import { type CatalogProduct, checkChangedFiles, checkSearchPage } from "./checks.ts";

const run = promisify(execFile);
const STOREFRONT = "apps/storefront";
const HERE = dirname(fileURLToPath(import.meta.url));

/** Queries whose rendered results are checked; "" is the all-products page. */
export const CHECK_QUERIES = ["", "black running shoe", "running shoes", "black", "hiking"];

export interface OptimizeOptions {
  /** Commit or ref of the baseline storefront. Defaults to HEAD of repoPath. */
  baseRef?: string;
  /** Parent directory for worktrees. Defaults to <repoPath>/../<repo>-droid-sandbox. */
  sandboxRoot?: string;
  /** Port the patched storefront is served on while checking. */
  port?: number;
  /** Leave the patched storefront running after an accepted patch and return its URL. */
  keepServer?: boolean;
  /** Keep the worktree of a rejected or failed patch for inspection (default: delete it). */
  keepRejected?: boolean;
  /** Progress output. */
  log?: (line: string) => void;
  /** Replaces the Droid prompt, e.g. for red-team runs that test the gates. */
  prompt?: (finding: Finding, allowedFiles: readonly string[]) => string;
  /**
   * Applies a scripted patch instead of running Droid, to test the gates
   * deterministically. The result is marked provenance "fixture".
   */
  simulatedPatch?: { description: string; apply: (worktree: string) => Promise<void> };
}

/** PatchResult plus the requests the permission handler blocked during the Droid run. */
export interface OptimizeResult extends PatchResult {
  /** File paths or tool types Droid asked to write or run and was refused. */
  blocked: string[];
}

const git = async (cwd: string, ...args: string[]) => (await run("git", args, { cwd, maxBuffer: 16 << 20 })).stdout;

export function droidPrompt(finding: Finding, allowedFiles: readonly string[]): string {
  const evidence = finding.evidence
    .filter((e) => e.metric)
    .map((e) => `- ${e.description}: ${e.metric!.value}`)
    .join("\n");
  return `You are improving the search results page of a Next.js shoe storefront in ${STOREFRONT}.

Finding from a recorded browsing-agent run:
${finding.summary}
${evidence}

Change: make each search-result card show, as visible semantic HTML, the product's color, its category, and its availability in every size, so a shopper can choose from the results page without opening product pages.

Rules:
- Edit only these files: ${allowedFiles.join(", ")}. Read any file you need; ${STOREFRONT}/lib/catalog.ts is the source of truth and must not be edited.
- Read color, category, sizes and stock from the catalog through lib/search.ts. Never hard-code or change a price, stock level, color or category.
- Every query must return the same products in the same order as now. Keep each card's price and its "View details" link.
- Show availability as a list with one item per size, worded like "Size 8: In stock (3 left)" or "Size 8: Sold out".
- Keep it general for any shopper. Do not special-case a particular color, size, product or task.
- Do not add APIs, scripts, or hidden content meant only for automated agents.
- Do not run shell commands; they will be denied.

When you are done, reply with a two- or three-sentence summary of the change.`;
}

/** Catalog and baseline search results, read from the worktree before Droid edits it. */
async function readBaseline(worktree: string): Promise<{ catalog: CatalogProduct[]; results: Record<string, string[]> }> {
  const lib = join(worktree, STOREFRONT, "lib");
  const code = `
    const { catalog } = await import(${JSON.stringify(join(lib, "catalog.ts"))});
    const { searchProducts } = await import(${JSON.stringify(join(lib, "search.ts"))});
    const queries = ${JSON.stringify(CHECK_QUERIES)};
    console.log(JSON.stringify({
      catalog,
      results: Object.fromEntries(queries.map((q) => [q, searchProducts(q).map((r) => r.slug)])),
    }));`;
  const { stdout } = await run(
    process.execPath,
    ["--import", join(HERE, "resolve-ts.ts"), "--input-type=module", "-e", code],
    { cwd: worktree },
  );
  return JSON.parse(stdout);
}

async function serve(worktree: string, port: number): Promise<ChildProcess> {
  const url = `http://localhost:${port}`;
  const inUse = await fetch(url).then(() => true, () => false);
  if (inUse) throw new Error(`Port ${port} is already in use; stop whatever is running there first.`);

  const server = spawn(join(worktree, "node_modules/.bin/next"), ["start", "-p", String(port)], {
    cwd: join(worktree, STOREFRONT),
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Patched storefront exited with code ${server.exitCode}`);
    if (await fetch(url).then((r) => r.ok, () => false)) return server;
    await new Promise((r) => setTimeout(r, 500));
  }
  server.kill();
  throw new Error(`Patched storefront did not start on port ${port}`);
}

/**
 * Accepted patches keep their worktree (it holds the built, servable site).
 * Rejected or failed ones are deleted unless options.keepRejected is set, since
 * each worktree carries its own node_modules (~450 MB).
 */
export async function optimize(input: OptimizeInput, options: OptimizeOptions = {}): Promise<OptimizeResult> {
  const created: { worktree?: string } = {};
  let result: OptimizeResult | undefined;
  try {
    result = await optimizeInWorktree(input, options, created);
    return result;
  } finally {
    if (created.worktree && result?.status !== "accepted" && !options.keepRejected) {
      await removeWorktree(input.repoPath, created.worktree);
      options.log?.(`removed worktree of the ${result?.status ?? "interrupted"} run: ${created.worktree}`);
    }
  }
}

async function optimizeInWorktree(
  input: OptimizeInput,
  options: OptimizeOptions,
  created: { worktree?: string },
): Promise<OptimizeResult> {
  const log = options.log ?? (() => {});
  const allowedFiles = input.allowedFiles.length > 0 ? input.allowedFiles : [...DROID_ALLOWED_FILES];
  const port = options.port ?? 3002;
  const repoPath = realpathSync(input.repoPath);
  const baseCommit = (await git(repoPath, "rev-parse", "--verify", `${options.baseRef ?? "HEAD"}^{commit}`)).trim();

  const result: OptimizeResult = {
    status: "failed",
    // The patch is generated live by Droid, whatever the trace's provenance
  // (simulated patches below switch this to "fixture").
    provenance: "live",
    diff: "",
    filesChanged: [],
    explanation: "",
    baseCommit,
    worktreePath: "",
    checks: { allowlist: false, build: false, tests: false },
    blocked: [],
  };
  const reject = (status: "rejected" | "failed", reason: string) => {
    log(`${status}: ${reason}`);
    return { ...result, status, rejectionReason: reason };
  };

  const diagnosis = input.diagnosis ?? (await diagnose(input.trace));
  const finding = diagnosis.findings.find((f) => f.kind === "excessive_navigation");
  if (!finding) return reject("rejected", "The diagnosis has no excessive_navigation finding to fix.");

  // 1. Disposable worktree, pinned to the baseline commit, outside the repo.
  const sandboxRoot = options.sandboxRoot ?? resolve(repoPath, "..", `${basename(repoPath)}-droid-sandbox`);
  mkdirSync(sandboxRoot, { recursive: true });
  const name = `${input.trace.runId}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const worktree = join(realpathSync(sandboxRoot), name);
  await git(repoPath, "worktree", "add", "--detach", worktree, baseCommit);
  result.worktreePath = worktree;
  created.worktree = worktree;
  log(`worktree: ${worktree} @ ${baseCommit.slice(0, 7)}`);

  const baseline = await readBaseline(worktree);

  // 2. Droid edits, gated by the factory adapter's permission handler.
  if (options.simulatedPatch) {
    log(`applying simulated patch (not Droid): ${options.simulatedPatch.description}`);
    await options.simulatedPatch.apply(worktree);
    result.provenance = "fixture";
    result.explanation = `Simulated patch, not generated by Droid: ${options.simulatedPatch.description}`;
  } else {
    log("running Factory Droid...");
    const prompt = (options.prompt ?? droidPrompt)(finding, allowedFiles);
    const droid = await runDroid({ cwd: worktree, prompt, allowedFiles, onEvent: log });
    result.toolRunId = droid.sessionId || undefined;
    result.explanation = droid.text.trim();
    result.blocked = droid.denied;
    if (droid.denied.length > 0) log(`permission handler blocked: ${droid.denied.join("; ")}`);
    if (!droid.success) return reject("failed", `Droid did not finish: ${droid.error ?? droid.subtype}`);
  }

  // 3. Allowlist gate on the actual diff, before anything is built or run.
  await git(worktree, "add", "--intent-to-add", "--all");
  result.filesChanged = (await git(worktree, "diff", "--name-only", baseCommit)).split("\n").filter(Boolean);
  result.diff = await git(worktree, "diff", baseCommit);
  const allowlist = checkChangedFiles(result.filesChanged, allowedFiles, DROID_PROTECTED_PATHS);
  result.checks.allowlist = allowlist.ok;
  if (!allowlist.ok) return reject("rejected", allowlist.problems.join("\n"));
  log(`allowlist: pass (${result.filesChanged.join(", ")})`);

  // 4. Build gate.
  log("installing dependencies and building the patched storefront...");
  try {
    await run("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], { cwd: worktree, maxBuffer: 64 << 20 });
    await run("npm", ["run", "build", "--workspace", STOREFRONT], { cwd: worktree, maxBuffer: 64 << 20 });
  } catch (error) {
    const out = error as { stdout?: string; stderr?: string };
    return reject("rejected", `Build failed:\n${`${out.stdout ?? ""}${out.stderr ?? ""}`.slice(-3000)}`);
  }
  result.checks.build = true;
  log("build: pass");

  // 5. Served-page gate: same results, no claims that contradict the catalog.
  const server = await serve(worktree, port);
  const url = `http://localhost:${port}`;
  let keep = false;
  try {
    // Problem -> the queries it appeared on, so each is reported once.
    const problems = new Map<string, string[]>();
    for (const q of CHECK_QUERIES) {
      const html = await (await fetch(`${url}/search${q ? `?q=${encodeURIComponent(q)}` : ""}`)).text();
      const page = checkSearchPage(html, baseline.results[q] ?? [], baseline.catalog);
      for (const p of page.problems) problems.set(p, [...(problems.get(p) ?? []), JSON.stringify(q)]);
    }
    result.checks.tests = problems.size === 0;
    if (problems.size > 0) {
      const lines = [...problems].map(([p, queries]) => `${p} (searches: ${queries.join(", ")})`);
      return reject("rejected", lines.join("\n"));
    }
    log(`search pages: pass (${CHECK_QUERIES.length} queries)`);

    keep = options.keepServer === true;
    return { ...result, status: "accepted", patchedUrl: keep ? url : undefined };
  } finally {
    if (!keep) server.kill();
  }
}

/** Removes a worktree created by optimize(). */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await git(repoPath, "worktree", "remove", "--force", worktreePath);
}
