# Perry agent audit (Apify Actor)

Owner: **Person A** (Zara), branch `feat/agent-benchmark`. Person B does not edit this directory.

Runs an AI shopping agent (Claude Haiku 5.5 driving Playwright) on a storefront, then checks the store's backend cart to verify the result. Repeats the run up to 5 times and reports completion rate, tool calls, tokens, median and p95 latency, and **cost per verified success**. It's the same agent and benchmark code as the local runner (`packages/agent-runner`, `packages/benchmark`), packaged so any audit can be rerun on demand in the cloud.

## Input

| Field | Meaning |
|---|---|
| `targetUrl` | Public URL of the storefront. It must serve `GET /api/cart` for verification. |
| `taskText` | The customer task given to the agent. Keep it identical across compared runs. |
| `expectedSku` | The only cart item that counts as success. |
| `siteVersion` | `baseline` or `patched`, recorded with the results. |
| `repetitions` | 1 to 5 runs. Each run costs model API credits. |
| `runLabel` | Optional note, e.g. a patch ID. |

## Output

- **Dataset:** one `AgentTrace` per run, with every step's action, page, model time, browser time and tokens, plus the verified cart. `meta.apifyRunId` links it back to this Actor run.
- **Key-value store `OUTPUT`:** the `BenchmarkResult` summary, plus `apifyRunId` and `runLabel`.

## Setup

- Built from GitHub (`packages/apify` on the `feat/agent-benchmark` branch). The Docker build context is the repo root (`dockerContextDir`).
- `ANTHROPIC_API_KEY` is set as a **secret** environment variable on the Actor version, never in code.
- A storefront on a laptop is reachable through a temporary tunnel, e.g. `cloudflared tunnel --url http://localhost:3001`.

## Local run

```bash
# Input goes in packages/apify/storage/key_value_stores/default/INPUT.json (gitignored)
npm run local -w @agentfix/apify
```
