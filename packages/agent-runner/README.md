# packages/agent-runner

Owner: **Person A**. Person A (Zara), branch `feat/agent-benchmark`. Person B does not edit this directory. Browser shopping agent; implements `RunTask`.

Each step, Claude (`claude-haiku-5-5`, effort `medium`) reads the page as a Playwright accessibility outline and picks one action: `navigate`, `click`, `type`, `select` or `done`. Playwright performs it. Every step records model time, browser time and tokens. The browser can only reach the storefront under test. Afterwards `@agentfix/verifier` reads the backend cart to decide success.

The model, effort, system prompt and tools are fixed constants in `index.ts`, identical for baseline and patched runs.

## Run

Needs `ANTHROPIC_API_KEY` in the repo-root `.env`, Chromium (`npx playwright install chromium`), and the storefront running.

```bash
npm run dev -w @agentfix/storefront                                   # :3001
npm run run-task -w @agentfix/agent-runner                            # baseline
npm run run-task -w @agentfix/agent-runner -- --version patched       # PATCHED_URL (:3002)
HEADED=1 npm run run-task -w @agentfix/agent-runner                   # watch the browser
```

Traces are saved to `data/results/trace-<runId>.json` with `provenance: "live"`.

Cost is estimated at Claude Haiku 5.5 list price ($0.10 / $0.50 per million input / output tokens). Output tokens include the model's thinking.
