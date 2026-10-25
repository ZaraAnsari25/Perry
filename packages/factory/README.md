# packages/factory

Owner: **Person B** (Michelle), branch `feat/optimizer-dashboard`. Person A does not edit this directory.

Factory Droid adapter, built on the official TypeScript SDK `@factory/droid-sdk` (0.10.0, `@factory/droid-sdk/node` entrypoint). Droid is a runtime component of Perry.

## Requirements

- The `droid` CLI on `PATH` (the SDK starts it as a subprocess).
- `FACTORY_API_KEY` in the repo-root `.env` (never committed).

## Proof of concept

```bash
npm run poc --workspace packages/factory
```

`scripts/poc.ts` copies the storefront search files into a throwaway git repo in the system temp dir, asks Droid to show color on the search-result cards, and checks the diff against `DROID_ALLOWED_FILES`. Two independent guards:

1. **Permission handler** (`autonomyLevel: Off`): every file edit, creation, patch or shell command needs approval. Only writes to `DROID_ALLOWED_FILES` are approved; everything else is cancelled. The SDK has no tool allowlist of its own, so this handler is the gate.
2. **Diff check** after the run: every changed or new file must be in `DROID_ALLOWED_FILES` and outside `DROID_PROTECTED_PATHS`.

Neither guard checks *what* the edit says (e.g. a wrong price on a card). That is the optimizer's job: verify that rendered values match the catalog.
