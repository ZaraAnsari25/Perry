// Has Factory Droid write this store's `shop` commands from the standard
// contract, then runs Perry's gates on it (see ../generate-interface.ts).
//
// Usage (from the repo root, with FACTORY_API_KEY in .env and droid on PATH):
//   npm run generate:interface                                   # generate and check (store mocked)
//   npm run generate:interface -- --store-url http://localhost:3001   # also the integration test
//   ... -- --retry-of data/results/interface-gen-<time>.json      # retry, telling Droid why the last one failed
//   ... -- --simulate outside-allowlist|imports-handwritten       # scripted output instead of Droid; should be rejected
//   ... -- --keep-worktree                                        # keep the disposable worktree
//
// Saves data/results/interface-gen-<time>.json and, when Droid wrote a file,
// data/results/interface-gen-<time>.core.ts. `npm run use:generated` copies an
// accepted one into packages/agent-interface/generated/core.ts.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type InterfaceGenResult, generateInterface } from "../generate-interface.ts";
import { SIMULATED_INTERFACES, type SimulatedInterfaceName } from "../interface-fixtures.ts";

const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const resultsDir = join(repoPath, "data/results");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const simulate = arg("--simulate") as SimulatedInterfaceName | undefined;
if (simulate && !(simulate in SIMULATED_INTERFACES))
  throw new Error(`Unknown --simulate: ${simulate}. One of: ${Object.keys(SIMULATED_INTERFACES).join(", ")}`);

let feedback: string | undefined;
const retryOf = arg("--retry-of");
if (retryOf) {
  if (!/^data\/results\/interface-gen-[\w.-]+\.json$/.test(retryOf)) throw new Error(`Not an interface-gen result: ${retryOf}`);
  const previous = JSON.parse(readFileSync(join(repoPath, retryOf), "utf8")) as InterfaceGenResult;
  if (previous.status === "accepted") throw new Error(`${retryOf} was accepted; nothing to retry.`);
  feedback = previous.gates
    .filter((g) => !g.ok && !g.skipped)
    .map((g) => `- ${g.name}: ${g.detail}`)
    .join("\n") || `- ${previous.reason ?? "it failed"}`;
  console.log(`retry:      after ${retryOf}`);
}

const log: string[] = [];
const result = await generateInterface({
  repoPath,
  storeUrl: arg("--store-url") ?? process.env.STORE_URL,
  keepWorktree: process.argv.includes("--keep-worktree"),
  feedback,
  simulatedOutput: simulate ? SIMULATED_INTERFACES[simulate] : undefined,
  log: (line) => {
    log.push(line);
    console.log(line);
  },
});

const stamp = result.createdAt.replace(/[:.]/g, "-");
const base = join(resultsDir, `interface-gen-${stamp}`);
mkdirSync(resultsDir, { recursive: true });
const { source, ...saved } = result;
if (source !== undefined) writeFileSync(`${base}.core.ts`, source);
writeFileSync(
  `${base}.json`,
  `${JSON.stringify({ ...saved, sourceFile: source !== undefined ? `data/results/interface-gen-${stamp}.core.ts` : undefined, retryOf, log }, null, 2)}\n`,
);

console.log("");
for (const g of result.gates) console.log(`${g.skipped ? "–" : g.ok ? "✓" : "✗"} ${g.name}: ${g.detail}`);
console.log(`status:     ${result.status}${result.droidSessionId ? ` (Droid session ${result.droidSessionId})` : ""}`);
console.log(`saved:      data/results/interface-gen-${stamp}.json`);
process.exit(result.status === "accepted" ? 0 : 1);
