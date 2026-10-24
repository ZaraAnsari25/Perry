# packages/benchmark

Owner: **Person A**. Person A (Zara), branch `feat/agent-benchmark`. Person B does not edit this directory. Repeated runs; implements `Benchmark` and `Compare`.

- `benchmark(input, onRun?)`: runs the agent `repetitions` times on one storefront, one run after another. The summary goes in `BenchmarkResult.baseline`, per the contract, whichever version was run.
- `compare(input, onRun?)`: runs the baseline and patched storefronts alternately (baseline, patched, baseline, …) with the same agent and task, and returns a `verdict`.
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

Results are saved to `data/results/`: each run as `trace-*.json`, and the summary as `benchmark-*.json` or `compare-*.json`.

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
