# packages/benchmark

Owner: **Person A**. Person A (Zara), branch `feat/agent-benchmark`. Person B does not edit this directory. Repeated runs; implements `Benchmark` and `Compare`.

- `benchmark(input, onRun?)`: runs the agent `repetitions` times on one storefront, one run after another. The summary goes in `BenchmarkResult.baseline`, per the contract, whichever version was run.
- `compare(input, onRun?)`: runs the baseline and patched storefronts alternately (baseline, patched, baseline, …) with the same agent and task, and returns a `verdict`.
- `benchmarkInterface(input, onRun?)` (`interface.ts`): runs the CLI-mode agent (`runTaskCli`) through the store's agent interface `repetitions` times. The summary goes in `baseline` with `siteVersion: "agent-interface"`.
- `compareThree(input, onRun?)` (`interface.ts`): original website, Droid-fixed website and agent interface in rotation, with `verdict` (fixed vs original) and `agentInterfaceVerdict` (interface vs original). It checks that both stores respond before any paid run.
- `onRun` is called after each run, so traces can be saved before the benchmark finishes.

**Verdict:** `improved` only if the verified completion rate doesn't drop **and** cost per verified success falls by more than 5% (`NOISE_MARGIN`). A lower completion rate is always `regressed`.

**Cost per verified success** = average cost per run / completion rate (`null` if nothing succeeded).

## Run

Every run calls the Claude API (about half a cent per run with Claude Haiku 5.5). The script prints the estimated cost before starting.

```bash
npm test -w @agentfix/benchmark                                     # unit tests, free
npm run bench -w @agentfix/benchmark -- --reps 2                    # baseline on BASELINE_URL
npm run bench -w @agentfix/benchmark -- --reps 5 --compare          # baseline vs PATCHED_URL
```

```bash
npm run bench:interface -w @agentfix/benchmark -- --reps 2          # agent interface only, on BASELINE_URL
npm run bench:interface -w @agentfix/benchmark -- --reps 5 --three  # original vs fixed vs interface (15 runs)
```

Results are saved to `data/results/`: each run as `trace-*.json`, and the summary as `benchmark-*.json` or `compare-*.json`. The agent-interface scripts save `interface-*.json` and `compare3-*.json` instead, never `benchmark-*` or `compare-*`, which the dashboard reads as browser runs.

## Methodology

**Question:** does the patched storefront let the same AI agent complete the same task with fewer actions, fewer tokens and lower cost, without losing correctness?

**Task:** "Find a black running shoe under $120 in size 8 that is in stock, and add it to my cart." The catalog has exactly one correct variant, `VEL-BLK-08` (Velocity Runner). The near-misses are a $125 black shoe, a black shoe with size 8 sold out, a navy shoe, a white shoe and a black hiking boot. Prices, colors and stock live in `apps/storefront/lib/catalog.ts`, which Factory Droid may not edit, so both versions sell identical products.

**Controls, identical for every run:**
- Model `claude-haiku-5-5`, effort `medium`, the same system prompt and the same five tools (`navigate`, `click`, `type`, `select`, `done`), all fixed constants in `packages/agent-runner/index.ts`.
- The same task text, expected SKU and 25-step limit (`data/tasks.json`).
- A fresh browser per run, restricted to the storefront under test.
- Both storefronts run on the same machine. Runs are sequential, so they don't compete for CPU, network or API rate limits, and they alternate between baseline and patched, so drift in API latency affects both equally.
- Only the storefront changes between baseline and patched.

**What counts as success:** after the agent stops, the verifier reads the storefront's backend cart (`GET /api/cart`). A run succeeds only if the cart holds exactly `VEL-BLK-08` with quantity 1. The agent saying "done" does not count.

**Metrics per run:**
- **Tool calls:** browser actions the agent took.
- **Tokens:** input and output tokens from the API's usage report. Output includes the model's thinking.
- **Cost:** tokens at list price ($0.10 / $0.50 per million input / output tokens for Claude Haiku 5.5).
- **Model time and browser time** are measured separately. They are reported side by side and not added together; total time is wall-clock.

**Per storefront:** completion rate, median and p95 total time, averages, and **cost per verified success** (average cost ÷ completion rate), the headline metric.

**Verdict:** `improved` only if the completion rate does not drop and cost per verified success falls by more than 5%. A lower completion rate is always `regressed`.

**Provenance:** every trace is labelled `live`, `replay` or `fixture`. Only `live` traces from real runs are reported as measurements. Apify cloud runs carry their Apify run ID in `meta.apifyRunId`.

### Measured result (2026-10-24, 5 + 5 live runs, alternating)

The patched storefront is the baseline plus Factory Droid's patch (session `645f6008`, based on `main` at `c19be23`). The patch changes only `components/search-results.tsx` and `lib/search.ts`, so search cards show color, category and per-size stock read from the catalog. Product pages, cart and catalog are identical in both versions. Result file: `data/results/compare-2026-10-24T23-15-06-410Z.json`.

| Metric | Baseline | Patched | Change |
|---|---|---|---|
| Verified completion | 5 / 5 (100%) | 5 / 5 (100%) | unchanged |
| Average tool calls | 6.8 (range 6–7) | 4.0 (all runs) | −41% |
| Average tokens | 33,946 | 22,509 | −34% |
| Cost per verified success | $0.00372 | $0.00246 | −34% |
| Median / p95 total time | 9.0 s / 11.6 s | 6.9 s / 8.7 s | −23% / −25% |
| Failed agent actions | 0 | 0 | |

**Verdict: improved.** On the patched storefront every run took the same path: search, open Velocity Runner, select size 8, add to cart. On the baseline the agent opened decoy product pages (Tempo Lite, Cloud Glide, Aero Pace) to check color and size-8 stock before finding the match. The patched search page is longer (102 vs 42 outline lines), so each search observation costs more tokens, but skipping the product-page visits more than makes up for it.

Diagnosis on a baseline trace: the agent opened 4 product pages to buy 1 product. The 3 wasted visits cost 4 tool calls and 14,680 tokens, about 42% of that run.

**Earlier runs.** The first 5 + 5 comparison (`compare-2026-10-24T21-53-32-153Z.json`) returned `regressed`. Its traces show the cause was the agent harness, not the storefront: the model sometimes dropped the frame prefix from element refs (`e113` for `f3e113`), each such action stalled for 10 s, and one patched run gave up. The same bug affected one earlier baseline run. The harness now resolves those refs and fails fast with a clear message on invalid refs or options. Both storefronts were then re-measured with the corrected agent, which gave the result above.

### Limitations

- Five runs per storefront illustrate the effect; they are not statistically conclusive. Run-to-run variation is real (6 to 7 tool calls on the same baseline storefront).
- One task on one controlled storefront; results don't automatically carry over to other sites or tasks.
- Cost is estimated from list prices, not billed amounts.
- Latency includes model API response time, which varies with load. Tool calls, tokens and verified completion are the more stable comparison.

## Agent interface and three-way comparison

`compareThree` measures the same task three ways: **(1)** the original website, **(2)** the Droid-fixed website and **(3)** the store's agent interface.

**What the agent gets in condition 3:**

- **One `bash` tool** (plus `done`) in a sandboxed fake shell (`@agentfix/agent-interface`, built on `just-bash`). There's no real shell, no store files, no network access and no JavaScript/Python runtime, and long outputs are truncated.
- **`shop` commands** built from the store's own catalog and cart (`shop search`, `shop product`, `shop cart add`, `shop cart show`, `shop checkout --dry-run`). The agent learns them from a short guide in its first message. The guide is generated from the catalog and doesn't name the answer.
- **`shop cart add <SKU>`** posts to the storefront's existing `POST /api/cart` under the run's own `cart_id`. Checkout is dry-run only, so no order is ever placed.

**Held constant across all three:** model (`claude-haiku-5-5`), effort (`medium`), task text, the 25-step limit, list-price cost accounting, and the verifier. A run succeeds only if `GET /api/cart` for that run's cart holds exactly the expected SKU × 1. Interface runs buy from the original store's cart (`:3001`).

**Run order:** each repetition runs original, then fixed, then interface, so drift in API latency over the session affects all three equally.

**Fairness note:** condition 2 changes the website's HTML. Condition 3 leaves the website alone and changes the interface the agent uses: one shell tool instead of five browser tools. Condition 3 measures what a tool-using agent (such as Claude Code or Droid) could do with an agent interface. It doesn't replace the website, which browsing-only agents still need.

**Trace differences:** interface runs have `runId` `run-agent-interface-…`, `siteVersion: "agent-interface"`, `meta.interface: "cli"` and `meta.interfaceImpl` (`handwritten` or `generated`). Each command is a `"shell"` step with `command`, `exitCode` and `output`, and `pagePath: "cli"`. In these traces, `browserMs` holds shell time.

### Measured result (2026-10-25, 5 + 5 + 5 live runs, rotating)

The same agent bought the right shoe in all 15 runs. Fixing the website cut cost per verified success by 31%; the agent interface cut it by 87%. There were 0 failed agent actions. Result file: `data/results/compare3-2026-10-25T09-53-52-448Z.json`.

| Metric | Original website | Droid-fixed website | Agent interface |
| --- | --- | --- | --- |
| Verified completion | 5 / 5 (100%) | 5 / 5 (100%) | 5 / 5 (100%) |
| Average tool calls | 6.6 (range 5–7) | 4.0 (all runs) | 2.0 (all runs) |
| Average tokens | 32,594 | 22,469 (−31%) | 3,732 (−89%) |
| Cost per verified success | $0.00358 | $0.00246 (−31%) | $0.00047 (−87%) |
| Median / p95 total time | 9.3 s / 9.5 s | 6.6 s / 8.4 s | 4.2 s / 4.3 s |
| Verdict vs original | | `improved` | `improved` |

**Setup:**

- Original store on `:3001`.
- Droid-fixed store on `:3002`: Droid patch session `645f6008` on `main` at `c19be23`, the same fix as the two-way result above.
- Agent interface: hand-written `shop` commands (`meta.interfaceImpl: "handwritten"`) buying from the `:3001` cart.

On the interface, every run took the same path: one `shop search` with the task's filters, then `shop cart add VEL-BLK-08`.

**Limitations:**

- 5 runs per condition, one task, one controlled store.
- The interface's advantage comes partly from structured search running in code, which this task suits well. The website conditions still matter for agents that can only browse.
- Cost is estimated from list prices. Time includes model API latency.
