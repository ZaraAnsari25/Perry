// Unit tests for the agent-interface benchmarks. Fake runners and a fake
// fetch: no agent runs, no API cost, no storefront.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentTrace, SiteVersion } from "@agentfix/shared";
import { sampleTrace } from "@agentfix/shared/fixtures";

import { benchmarkInterface, compareThree, type InterfaceBenchmarkDeps } from "./interface.ts";

const trace = (siteVersion: SiteVersion, url: string, costUsd: number, toolCalls: number): AgentTrace => ({
  ...sampleTrace,
  provenance: "live",
  siteVersion,
  url,
  metrics: { ...sampleTrace.metrics, estimatedCostUsd: costUsd, toolCalls },
  outcome: { ...sampleTrace.outcome, success: true },
});

const INPUT = {
  baselineUrl: "http://localhost:3001",
  patchedUrl: "http://localhost:3002",
  task: "Find a black running shoe under $120 in size 8 that is in stock, and add it to my cart.",
  expectedSku: "VEL-BLK-08",
  repetitions: 2,
};

/** Fake runners that record the order of runs; the CLI runner is cheapest. */
function fakes(serving: Record<string, boolean> = {}) {
  const order: string[] = [];
  const deps: InterfaceBenchmarkDeps = {
    runTask: async ({ url, siteVersion }) => {
      order.push(`${siteVersion}@${url}`);
      return siteVersion === "baseline" ? trace("baseline", url, 0.004, 7) : trace("patched", url, 0.0025, 4);
    },
    runTaskCli: async ({ url }) => {
      order.push(`agent-interface@${url}`);
      return trace("agent-interface", url, 0.0005, 2);
    },
    fetch: (async (url: string | URL) =>
      ({ ok: serving[String(url)] ?? true, status: serving[String(url)] === false ? 502 : 200 }) as Response) as typeof fetch,
  };
  return { order, deps };
}

test("compareThree rotates baseline, patched, interface and fills both verdicts", async () => {
  const { order, deps } = fakes();
  const saved: string[] = [];

  const result = await compareThree(INPUT, (t, i, n) => void saved.push(`${t.siteVersion} ${i}/${n}`), deps);

  assert.deepEqual(order, [
    "baseline@http://localhost:3001",
    "patched@http://localhost:3002",
    "agent-interface@http://localhost:3001",
    "baseline@http://localhost:3001",
    "patched@http://localhost:3002",
    "agent-interface@http://localhost:3001",
  ]);
  assert.deepEqual(saved, ["baseline 1/2", "patched 1/2", "agent-interface 1/2", "baseline 2/2", "patched 2/2", "agent-interface 2/2"]);

  assert.equal(result.provenance, "live");
  assert.equal(result.baseline.siteVersion, "baseline");
  assert.equal(result.patched?.siteVersion, "patched");
  assert.equal(result.agentInterface?.siteVersion, "agent-interface");
  assert.equal(result.agentInterface?.url, "http://localhost:3001");
  assert.equal(result.agentInterface?.runs.length, 2);
  assert.equal(result.agentInterface?.avgToolCalls, 2);
  assert.equal(result.verdict, "improved");
  assert.equal(result.agentInterfaceVerdict, "improved");
});

test("compareThree stops before any run when the fixed store isn't serving", async () => {
  const { order, deps } = fakes({ "http://localhost:3002": false });

  await assert.rejects(
    compareThree(INPUT, undefined, deps),
    /Droid-fixed store at http:\/\/localhost:3002 is not responding \(HTTP 502\)\. .*serve:patched/,
  );
  assert.deepEqual(order, []);
});

test("compareThree sends the interface to its own store when given one", async () => {
  const { order, deps } = fakes();

  await compareThree({ ...INPUT, repetitions: 1, interfaceUrl: "http://localhost:3005" }, undefined, deps);

  assert.equal(order.at(-1), "agent-interface@http://localhost:3005");
});

test("benchmarkInterface summarizes interface runs in baseline", async () => {
  const { order, deps } = fakes();

  const result = await benchmarkInterface(
    { url: "http://localhost:3001", task: INPUT.task, expectedSku: INPUT.expectedSku, repetitions: 3 },
    undefined,
    deps,
  );

  assert.equal(order.length, 3);
  assert.equal(result.baseline.siteVersion, "agent-interface");
  assert.equal(result.baseline.completionRate, 1);
  assert.equal(result.patched, undefined);
  assert.equal(result.verdict, undefined);
});
