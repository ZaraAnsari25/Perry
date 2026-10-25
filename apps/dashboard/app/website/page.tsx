import { diagnose } from "@agentfix/diagnosis";
import Link from "next/link";
import { connection } from "next/server";

import { liveWorktree } from "@/lib/child-process";
import { allPatches, recentPatches } from "@/lib/results";
import { type RunParams, selectRun } from "@/lib/run-selection";

import { OptimizeButton } from "../optimize-button";
import { PatchCard, PatchPanel } from "../patch-panel";
import { Card, Page, PageHeader, Pager, SectionTitle } from "../ui";

const steps = [
  {
    title: "Droid reads the problem",
    body: "Step 1's diagnosis (for example, the agent opened 4 product pages to buy 1) and the code for the store's search page.",
  },
  {
    title: "Droid edits a throwaway copy",
    body: "It may change only two files: the search-results card and the search code. Prices, stock, the task and Perry's checks are locked, and shell commands are blocked.",
  },
  {
    title: "Perry checks it before it goes live",
    body: "Only allowed files changed, the store still builds, and every price and stock level still matches the catalog. Then the same agent shops the fixed store to measure it.",
  },
];

export default async function Website({ searchParams }: { searchParams: Promise<RunParams> }) {
  await connection();
  const { benchmark, runs, runIndex, trace } = await selectRun(await searchParams);
  const diagnosis = await diagnose(trace);
  // Only fixes generated from the run being worked on.
  const patches = (await recentPatches()).filter((p) => p.traceRunId === trace.runId);
  const everyFix = (await allPatches()).filter((p) => !p.redTeam);
  // Accepted fixes that can still be made live: what "Choose an earlier fix" offers.
  const hasEarlierFixes = everyFix.some((p) => p.servable);
  // If the newest fix for this run wasn't accepted, Optimize becomes "Try again".
  const lastTry = patches[0]?.status !== "accepted" ? patches[0] : undefined;
  // Which saved fix, if any, the fixed store on localhost:3002 is serving.
  const live = await liveWorktree();
  // The live fix, when it wasn't made from this run (e.g. the Demo backup, made live from Fix history).
  const liveElsewhere =
    live === undefined || patches.some((p) => p.worktreePath === live) ? undefined : everyFix.find((p) => p.worktreePath === live);
  const now = Date.now();

  return (
    <Page>
      <PageHeader title="Droid fixes the website" audience="Feature 1 · for today's internet" tone="violet">
        We built two complementary approaches: one for the internet as it is today, and one for the agent-first internet
        we see coming. This is the first. Today, most AI agents, such as ChatGPT&apos;s agent and Claude in Chrome, shop the
        way a person does: load a page, read it, click. Perry hands Step 1&apos;s diagnosis to Factory Droid, an AI coding
        agent, which edits the store&apos;s own search page so these agents find their answer sooner. The agents don&apos;t
        need anything new.
      </PageHeader>

      <Card className="space-y-0 p-0 sm:p-0">
        <ol className="grid divide-seam md:grid-cols-3 md:divide-x">
          {steps.map((s, i) => (
            <li key={s.title} className="space-y-2 border-b border-seam p-5 last:border-b-0 sm:p-6 md:border-b-0">
              <p className="flex items-center gap-2.5 font-medium">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 font-mono text-xs text-white"
                >
                  {i + 1}
                </span>
                {s.title}
              </p>
              <p className="text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      <section className="space-y-3">
        <SectionTitle
          aside={
            runs.length > 0 && (
              <>
                Run {runIndex + 1} of {runs.length}, {trace.metrics.toolCalls} steps ·{" "}
                <Link href={`/measure?run=${runIndex + 1}`} className="text-perry-deep underline">
                  pick another on Measure
                </Link>
              </>
            )
          }
        >
          Fix this run
        </SectionTitle>
        {diagnosis.findings.some((f) => f.kind === "excessive_navigation") ? (
          <OptimizeButton
            key={lastTry?.file ?? "fresh"}
            benchmark={benchmark && runs[runIndex] ? benchmark.file.replace("data/results/", "") : undefined}
            run={runIndex + 1}
            retryOf={lastTry?.file}
            attempt={lastTry?.attempt}
            hasEarlierFixes={hasEarlierFixes}
          />
        ) : (
          <p className="text-sm text-muted">Perry found no wasted browsing in this run, so there&apos;s nothing to fix.</p>
        )}
      </section>

      {liveElsewhere && (
        <section className="space-y-3">
          <SectionTitle
            aside={
              <>
                <a href="http://localhost:3002/search?q=black+running+shoe" className="text-perry-deep underline">
                  localhost:3002
                </a>{" "}
                is serving it{liveElsewhere.location === "backup" ? ": the Demo backup Droid made earlier (a replay)" : ", made from another run"}
              </>
            }
          >
            The fix that&apos;s live now
          </SectionTitle>
          <PatchCard patch={liveElsewhere} now={now} live={live} replay={liveElsewhere.location === "backup"} />
        </section>
      )}
      {(!liveElsewhere || patches.length > 0) && <PatchPanel patches={patches} live={live} now={now} />}
      <p className="text-sm">
        <Link href="/history" className="font-medium text-perry-deep underline">
          See all Droid fixes ({everyFix.length})
        </Link>{" "}
        <span className="text-faint">including other runs and ones archived by a reset</span>
      </p>

      <Pager back={{ href: `/measure?run=${runIndex + 1}`, label: "Step 1: Measure" }} next={{ href: "/commands", label: "Feature 2: Shop commands" }} />
    </Page>
  );
}
