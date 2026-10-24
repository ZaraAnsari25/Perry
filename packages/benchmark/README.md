# packages/benchmark

Owner: **Person A**. Person A (Zara), branch `feat/agent-benchmark`. Person B does not edit this directory. Repeated runs; implements `Benchmark` and `Compare`.

- `benchmark(input, onRun?)`: runs the agent `repetitions` times on one storefront, one run after another. The summary goes in `BenchmarkResult.baseline`, per the contract, whichever version was run.
- `compare(input, onRun?)`: benchmarks the baseline, then the patched storefront, with the same agent and task, and returns a `verdict`.
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
- Runs are sequential on the same machine, so they don't compete for CPU, network or API rate limits.
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

### Measured baseline (2026-10-24, 5 live runs, original storefront)

| Metric | Result |
|---|---|
| Verified completion | 5 / 5 (100%) |
| Median / p95 total time | 9.0 s / 21.6 s |
| Average tool calls | 6.6 (range 6–8) |
| Average tokens | 32,164 |
| Cost per verified success | $0.00353 |

Diagnosis on a baseline trace: the agent opened 4 product pages to buy 1 product; the 3 wasted visits cost 4 tool calls and 14,680 tokens (about 42% of that run).

### Limitations

- Five runs per storefront illustrate the effect; they are not statistically conclusive. Run-to-run variation is real (6 to 8 tool calls on the same storefront).
- One task on one controlled storefront; results don't automatically carry over to other sites or tasks.
- Cost is estimated from list prices, not billed amounts.
- Latency includes model API response time, which varies with load. Tool calls, tokens and verified completion are the more stable comparison.
