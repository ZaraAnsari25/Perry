// AgentFix shared integration contract.
//
// FROZEN after the initial commit. Person A (Zara) produces AgentTrace and
// BenchmarkResult; Person B (Michelle) produces Diagnosis and PatchResult.
// Any change needs a short review from both people and one coordinated
// commit to this file. Prefer adding optional fields over changing existing ones.

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/** Which storefront build a run targeted. */
export type SiteVersion = "baseline" | "patched" | "agent-interface";

/**
 * Where a result came from. Never present "fixture" or "replay" as live.
 * - live:    produced by a real run just now
 * - replay:  a previously recorded real run, shown again
 * - fixture: hand-written sample data for development only
 */
export type Provenance = "live" | "replay" | "fixture";

/** ISO 8601 timestamp, e.g. "2026-10-24T09:00:00.000Z". */
export type IsoTimestamp = string;

// ---------------------------------------------------------------------------
// Task + run (Person A)
// ---------------------------------------------------------------------------

/** Input to runTask(). The same task text and expectedSku are used for both site versions. */
export interface RunTaskInput {
  /** Storefront base URL, e.g. http://localhost:3001 */
  url: string;
  /** Plain-English customer task given to the browser agent, unchanged across versions. */
  task: string;
  /** The one SKU that counts as success, e.g. a black size-8 shoe variant. */
  expectedSku: string;
  siteVersion: SiteVersion;
  /** Hard stop for the agent loop. */
  maxSteps?: number;
}

export type StepAction =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "scroll"
  | "observe"
  | "extract"
  | "wait"
  | "done"
  | "shell";

/** One agent step: the model chose an action, the browser executed it. */
export interface TraceStep {
  index: number;
  action: StepAction;
  /** Human-readable target: a URL path for navigate, a locator/description otherwise. */
  target?: string;
  /** Page path the step ran on, e.g. "/products/tempo-lite". Used by diagnosis rules. */
  pagePath: string;
  /** Milliseconds since the run started. */
  startMs: number;
  /** Browser/network time for this step's action. */
  browserMs: number;
  /** Model time spent choosing this step's action. */
  modelMs: number;
  inputTokens: number;
  outputTokens: number;
  ok: boolean;
  error?: string;
  /** Shell steps only: the exact command the agent ran. */
  command?: string;
  /** Shell steps only: the command's exit code. */
  exitCode?: number;
  /** Shell steps only: what the agent saw (stdout, or stderr if empty), cut to 1,000 characters, for the dashboard transcript. */
  output?: string;
}

export interface CartItem {
  sku: string;
  quantity: number;
}

/** Outcome read from the storefront backend, never from the agent's own claim. */
export interface VerifiedOutcome {
  success: boolean;
  /** What the agent said happened; recorded for comparison only. */
  agentClaimedDone: boolean;
  cart: CartItem[];
  reason?: string;
}

/** Aggregates for one run. Model and browser time may overlap; do not add them up as total time. */
export interface RunMetrics {
  totalMs: number;
  modelMs: number;
  browserMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Number of browser/tool actions the agent took. */
  toolCalls: number;
  estimatedCostUsd: number;
}

/** Output of runTask(). Person A keeps this shape stable so Person B can consume it unchanged. */
export interface AgentTrace {
  runId: string;
  provenance: Provenance;
  siteVersion: SiteVersion;
  url: string;
  task: string;
  expectedSku: string;
  /** Model ID used by the browser agent; must match across compared runs. */
  model: string;
  startedAt: IsoTimestamp;
  steps: TraceStep[];
  metrics: RunMetrics;
  outcome: VerifiedOutcome;
  /**
   * Sponsor / tooling IDs (e.g. apifyRunId). Metadata only:
   * never passed into the measured agent's prompt.
   */
  meta?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Diagnosis (Person B)
// ---------------------------------------------------------------------------

export type FindingKind =
  | "excessive_navigation"
  | "slow_request"
  | "redundant_observation"
  | "large_context"
  | "repeated_failed_actions";

export interface Evidence {
  description: string;
  /** TraceStep.index values that support this finding. */
  stepIndexes?: number[];
  metric?: { name: string; value: number; threshold: number };
}

/** A hypothesis backed by trace evidence, not a proven root cause. */
export interface Finding {
  kind: FindingKind;
  severity: "low" | "medium" | "high";
  summary: string;
  evidence: Evidence[];
  /** Repo-relative files a fix would touch; must be a subset of DROID_ALLOWED_FILES. */
  candidateFiles: string[];
}

/** Output of diagnose(). */
export interface Diagnosis {
  runId: string;
  provenance: Provenance;
  findings: Finding[];
  createdAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Optimization (Person B)
// ---------------------------------------------------------------------------

/** Input to optimize(). */
export interface OptimizeInput {
  trace: AgentTrace;
  /** Path of the repository checkout the disposable worktree is created from. */
  repoPath: string;
  /** Repo-relative paths Droid may change. Defaults to DROID_ALLOWED_FILES. */
  allowedFiles: string[];
  /** Pre-computed diagnosis; optimize() runs diagnose() itself if omitted. */
  diagnosis?: Diagnosis;
}

export type PatchStatus = "accepted" | "rejected" | "failed";

/** Output of optimize(). */
export interface PatchResult {
  status: PatchStatus;
  provenance: Provenance;
  /** Unified Git diff against baseCommit. */
  diff: string;
  filesChanged: string[];
  explanation: string;
  /** Baseline storefront commit the worktree was pinned to. */
  baseCommit: string;
  worktreePath: string;
  /** Factory Droid session/run identifier, for provenance. */
  toolRunId?: string;
  checks: {
    allowlist: boolean;
    build: boolean;
    tests: boolean;
  };
  rejectionReason?: string;
  /** URL of the patched storefront when it is running, e.g. http://localhost:3002 */
  patchedUrl?: string;
}

// ---------------------------------------------------------------------------
// Benchmark + compare (Person A)
// ---------------------------------------------------------------------------

/** Input to benchmark(): repeated runs against one site version. */
export interface BenchmarkInput {
  url: string;
  task: string;
  expectedSku: string;
  siteVersion: SiteVersion;
  repetitions: number;
}

/** Input to compare(): same task, same agent, both site versions. */
export interface CompareInput {
  baselineUrl: string;
  patchedUrl: string;
  task: string;
  expectedSku: string;
  repetitions: number;
}

export interface VariantSummary {
  siteVersion: SiteVersion;
  url: string;
  runs: AgentTrace[];
  /** Fraction of runs whose VerifiedOutcome.success is true, 0..1. */
  completionRate: number;
  medianTotalMs: number;
  p95TotalMs: number;
  avgToolCalls: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgCostUsd: number;
  /** avgCostUsd / completionRate; null when no run succeeded. */
  costPerVerifiedSuccessUsd: number | null;
}

/** Output of benchmark() (baseline only) and compare() (both versions). */
export interface BenchmarkResult {
  provenance: Provenance;
  task: string;
  expectedSku: string;
  model: string;
  repetitions: number;
  baseline: VariantSummary;
  patched?: VariantSummary;
  verdict?: "improved" | "no_change" | "regressed";
  createdAt: IsoTimestamp;
  /** Three-way comparisons only: the agent-interface condition. */
  agentInterface?: VariantSummary;
  /** Three-way comparisons only: agent interface vs. baseline, same rule as `verdict`. */
  agentInterfaceVerdict?: BenchmarkResult["verdict"];
}

// ---------------------------------------------------------------------------
// Function signatures
// ---------------------------------------------------------------------------

export type RunTask = (input: RunTaskInput) => Promise<AgentTrace>;
export type Benchmark = (input: BenchmarkInput) => Promise<BenchmarkResult>;
export type Compare = (input: CompareInput) => Promise<BenchmarkResult>;
export type Diagnose = (trace: AgentTrace) => Promise<Diagnosis>;
export type Optimize = (input: OptimizeInput) => Promise<PatchResult>;

// ---------------------------------------------------------------------------
// Factory Droid file permissions
// ---------------------------------------------------------------------------

/**
 * The only files Factory Droid may change. Person A creates these in the
 * storefront; the optimizer rejects any diff touching anything else.
 */
export const DROID_ALLOWED_FILES = [
  "apps/storefront/components/search-results.tsx",
  "apps/storefront/lib/search.ts",
] as const;

/**
 * Files that hold product truth, task definitions, or verification logic.
 * Listed explicitly so the optimizer can report why a diff was rejected.
 * The product catalog (prices, inventory) must live in its own file.
 */
export const DROID_PROTECTED_PATHS = [
  "apps/storefront/lib/catalog.ts",
  "data/tasks.json",
  "packages/verifier/",
  "packages/shared/",
] as const;
