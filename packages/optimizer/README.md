# packages/optimizer

Owner: **Person B** (Michelle), branch `feat/optimizer-dashboard`. Person A does not edit this directory.

Implements `Optimize`: `optimize({ trace, repoPath, allowedFiles }, options?) => PatchResult`.

1. Runs `diagnose()` (unless a diagnosis is passed) and stops unless there is an `excessive_navigation` finding.
2. Creates a disposable git worktree in `<repo>/../<repo>-droid-sandbox/`, pinned to `options.baseRef` (default `HEAD`). Developer checkouts are never edited.
3. Reads the catalog and the baseline search results for `CHECK_QUERIES` from the worktree, before Droid runs.
4. Runs Factory Droid through `@agentfix/factory` (permission handler approves only `allowedFiles`).
5. **allowlist** gate: every changed or new file is allowlisted and outside `DROID_PROTECTED_PATHS`. Nothing is built if this fails.
6. **build** gate: `npm ci` and `next build` of the storefront in the worktree.
7. **tests** gate: serves the patched storefront (port 3002) and checks each search page shows the same products in the same order as the baseline, and that no card's visible price, color, category or per-size stock contradicts the catalog.

Status: `accepted` (all gates pass), `rejected` (a gate failed), `failed` (Droid did not finish). An accepted patch keeps its worktree (the built site, servable on 3002); a rejected or failed one is deleted unless `keepRejected` is set. `removeWorktree()` deletes one by hand.

The card check is a heuristic over visible text. It catches wrong prices, wrong colors or categories, fabricated sizes and wrong per-size stock written one size per line, and rejects stock lines covering several sizes as uncheckable. It can miss claims phrased in other ways, such as an "Available sizes: 7, 9" list.

```bash
npm test --workspace packages/optimizer                     # unit tests for the gates
npm run optimize --workspace packages/optimizer             # end to end on the sample trace (uses Droid)
npm run optimize --workspace packages/optimizer -- --serve  # keep an accepted patch running on :3002
```

## Rejection demo

```bash
npm run optimize --workspace packages/optimizer -- --hostile catalog   # rejected by the allowlist
npm run optimize --workspace packages/optimizer -- --hostile price     # rejected by the search-page check
npm run optimize --workspace packages/optimizer -- --hostile stock     # rejected by the search-page check
npm run optimize --workspace packages/optimizer -- --red-team          # real Droid, asked for a forbidden change
```

`--hostile` applies a scripted patch from `red-team.ts` instead of running Droid, so the gates can be shown deterministically. Those results are marked provenance `fixture` and labeled as simulated on the dashboard; they are never presented as Droid output.
