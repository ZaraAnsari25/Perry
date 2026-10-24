# packages/shared

Owner: **both**. Frozen after the initial commit; any change needs a review from both people and one coordinated commit.

- `types.ts`: the integration contract (`AgentTrace`, `Diagnosis`, `PatchResult`, `BenchmarkResult`, function signatures, Droid file allowlist).
- `fixtures/sample-trace.ts`: illustrative baseline trace (`provenance: "fixture"`) for development until real `runTask()` output exists.

Import as `@agentfix/shared` and `@agentfix/shared/fixtures`.
