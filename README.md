# AgentFix

AgentFix measures how an AI browsing agent completes a real task on a website, diagnoses avoidable overhead from the trace, has Factory Droid generate a constrained source patch at runtime, and verifies the patched site with the same unchanged agent.

North-star metric: **cost per verified successful task**. Speed and token savings count only when the verified cart outcome is unchanged.

## Ownership

| Path | Owner |
|---|---|
| `apps/storefront/` | Person A (Zara) |
| `apps/dashboard/` | Person B (Michelle) |
| `packages/agent-runner/`, `benchmark/`, `verifier/`, `apify/` | Person A |
| `packages/diagnosis/`, `optimizer/`, `factory/` | Person B |
| `packages/shared/` | Both. Frozen; changes need review from both people |
| `data/tasks.json` | Person A |
| `data/results/` | Generated, gitignored |
| Root `package.json`, workspace config, `package-lock.json`, `tsconfig*` | Person B (integration owner) |

Never edit another person's directory; work through the contract in `packages/shared/types.ts`.

## Setup

```bash
npm install
npm run typecheck
npm run dev:dashboard   # http://localhost:3000
```

Node 22+. Each workspace adds its own dependencies in its own `package.json`. Person A: when you add or change dependencies, tell Person B so the lockfile is reconciled at merge time, not edited on both branches in parallel. Use the same versions already in the repo for shared libraries (`next 16.4.3`, `react 19.3.1`, `tailwindcss 4.3.3`, `typescript 5.9.3`).

Secrets go in a local `.env` (see `.env.example`); never commit them.

## Git protocol

- `main` holds the agreed foundation. Person A works on `feat/agent-benchmark`, Person B on `feat/optimizer-dashboard`, each in their own clone.
- Merge small, working increments at the hour 2, 7, 11, 16 and 21 checkpoints. One person merges into `main` at a time, after build and typecheck pass.
- Factory Droid edits code only in a disposable worktree outside the repo (e.g. `~/Perry-droid-sandbox`), pinned to a baseline storefront commit. It never edits a developer checkout.

## Contract

```ts
runTask({ url, task, expectedSku, siteVersion })        => AgentTrace        // Person A
benchmark({ url, task, expectedSku, siteVersion, repetitions }) => BenchmarkResult // Person A
compare({ baselineUrl, patchedUrl, task, expectedSku, repetitions }) => BenchmarkResult // Person A
diagnose(trace)                                          => Diagnosis         // Person B
optimize({ trace, repoPath, allowedFiles })              => PatchResult       // Person B
```

Every result carries `provenance: "live" | "replay" | "fixture"`. Never present replayed or fixture data as live.

## Factory Droid guardrails

- Droid may change only `DROID_ALLOWED_FILES`: the storefront search-results component and the search/query module.
- The product catalog (prices, inventory) lives in its own read-only file. Droid never touches prices, inventory, task specs, expected outcomes or the verifier (`DROID_PROTECTED_PATHS`).
- The generated Git diff is validated against the allowlist before the patched app is built or run.

## Fair-comparison rules

- Same browsing agent in both conditions: same model, prompt, tools and task. Only the website changes.
- The optimization renders color, size and stock in the search-results HTML; the agent gets no special search tool.
- The catalog has exactly one eligible shoe (black, size 8, in stock, under $120); decoys force product-page checks on the baseline.
