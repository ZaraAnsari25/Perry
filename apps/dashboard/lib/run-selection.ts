// Which recorded run a page shows: ?run=N of the newest baseline benchmark, or
// ?compare=<file>[&site=patched]&run=N for the runs of one measurement.

import type { AgentTrace, BenchmarkResult, SiteVersion } from "@agentfix/shared";
import { sampleTrace } from "@agentfix/shared/fixtures";

import { type RunAverages, averages } from "@/lib/metrics";
import { latestBenchmark, loadCompare } from "@/lib/results";

export interface RunParams {
  run?: string;
  site?: string;
  compare?: string;
}

export interface RunSelection {
  benchmark: { result: BenchmarkResult; file: string } | null;
  /** True when viewing one measurement's runs (?compare=). */
  measurement: boolean;
  site: SiteVersion;
  runs: AgentTrace[];
  runIndex: number;
  /** The run shown: a real one when a benchmark exists, the fixture otherwise. */
  trace: AgentTrace;
  /** Averages over every run in the shown set: the baseline the rest of the demo beats. */
  avg: RunAverages | null;
}

/** The run with the median step count, as the default to show. */
function medianRunIndex(runs: AgentTrace[]): number {
  const order = runs.map((r, i) => [r.metrics.toolCalls, i] as const).sort((a, b) => a[0] - b[0]);
  return order[Math.floor((order.length - 1) / 2)]?.[1] ?? 0;
}

export async function selectRun(params: RunParams): Promise<RunSelection> {
  const measured = params.compare ? await loadCompare(params.compare) : null;
  const benchmark = measured ? { result: measured, file: `data/results/${params.compare}` } : await latestBenchmark();
  const site: SiteVersion = measured && params.site === "patched" && measured.patched ? "patched" : "baseline";
  const runs = (site === "patched" ? benchmark?.result.patched?.runs : benchmark?.result.baseline.runs) ?? [];
  const requested = Number(params.run) - 1;
  const runIndex = runs[requested] ? requested : medianRunIndex(runs);
  return {
    benchmark,
    measurement: measured !== null,
    site,
    runs,
    runIndex,
    trace: runs[runIndex] ?? sampleTrace,
    avg: runs.length > 0 ? averages(runs) : null,
  };
}
