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
