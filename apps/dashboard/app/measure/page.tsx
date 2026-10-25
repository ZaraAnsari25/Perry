import { diagnose } from "@agentfix/diagnosis";
import Link from "next/link";
import { connection } from "next/server";

import { type RunParams, selectRun } from "@/lib/run-selection";

import { AverageRow, FindingCard, ProvenanceChip, RunDetail, RunPicker, siteName } from "../run-view";
import { Card, Page, PageHeader, Pager, SectionTitle } from "../ui";

export default async function Measure({ searchParams }: { searchParams: Promise<RunParams> }) {
  await connection();
  const sel = await selectRun(await searchParams);
  const { benchmark, measurement, site, runs, runIndex, trace, avg } = sel;
  const diagnosis = await diagnose(trace);
  const flagged = new Set(diagnosis.findings.flatMap((f) => f.evidence.flatMap((e) => e.stepIndexes ?? [])));

  return (
    <Page>
      {measurement ? (
        <PageHeader title="Runs from one measurement" audience="The same agent on the original store and on a fixed one">
          Pick a run to see its steps.{" "}
          <Link href="/website" className="font-medium text-perry-deep underline">
            Back to Fix the website
          </Link>
        </PageHeader>
      ) : (
        <PageHeader title="How an AI agent shops this store today" audience="Step 1 · the baseline both features try to beat">
          Before changing anything, Perry measures. It gives a real AI agent a shopping task and lets it use the
          store&apos;s website in a browser, the way a person would. Perry records every click, page, token and second,
          then reads the store&apos;s real cart to check it bought the right item.
        </PageHeader>
      )}

      <Card className="grid gap-6 md:grid-cols-[2fr_1fr] md:space-y-0">
        <div>
          <p className="text-xs font-medium text-muted">The task</p>
          <p className="mt-1 text-xl leading-snug text-balance">{trace.task}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Counts as a success only if</p>
          <p className="mt-1 text-sm text-muted">
            the store&apos;s real cart holds exactly <code className="font-mono text-ink">{trace.expectedSku}</code> × 1,
            the one shoe that fits.
          </p>
        </div>
      </Card>

      {avg && benchmark && (
        <section className="space-y-3">
          <SectionTitle aside={<ProvenanceChip provenance={benchmark.result.provenance} />}>
            Average of {avg.runs} runs on the {siteName[site].toLowerCase()}
          </SectionTitle>
          <AverageRow avg={avg} />
          <p className="text-xs text-faint">
            Recorded {new Date(benchmark.result.createdAt).toLocaleString("en-US")} ·{" "}
            <code className="font-mono">{benchmark.file.replace("data/results/", "")}</code>
          </p>
        </section>
      )}

      {benchmark && (
        <section className="space-y-3">
          <SectionTitle aside="Amber rows are where Perry found wasted effort">Look inside one run</SectionTitle>
          <Card>
            <RunPicker
              result={benchmark.result}
              file={benchmark.file}
              site={site}
              runIndex={runIndex}
              measurement={measurement}
              basePath="/measure"
            />
            <RunDetail trace={trace} avg={avg} flagged={flagged} />
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>What Perry found in this run</SectionTitle>
        {diagnosis.findings.length === 0 ? (
          <p className="text-sm text-muted">No wasted effort found in this run.</p>
        ) : (
          diagnosis.findings.map((f) => <FindingCard key={f.kind} finding={f} />)
        )}
      </section>

      <Pager
        back={{ href: "/", label: "Overview" }}
        next={
          measurement
            ? { href: "/website", label: "Back to Fix the website" }
            : { href: runs.length > 0 ? `/website?run=${runIndex + 1}` : "/website", label: "Feature 1: Fix the website" }
        }
      />
    </Page>
  );
}
