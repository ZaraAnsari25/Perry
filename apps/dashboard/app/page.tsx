import Link from "next/link";
import { connection } from "next/server";

import { demoStart, latestThreeWay } from "@/lib/interface";
import { averages } from "@/lib/metrics";
import { STORE_URL, host } from "@/lib/mode";
import { progress } from "@/lib/progress";
import { latestBenchmark } from "@/lib/results";

import { ArrowRightIcon, StateMark } from "./icons";
import { TimingTower, TowerStatus } from "./timing-tower";
import { Page, Pager } from "./ui";

const track = [
  {
    href: "/measure",
    title: "Measure",
    who: "Step 1",
    body: "A real AI agent shops the original store. Perry records every step and checks the cart.",
    key: "measure",
  },
  {
    href: "/website",
    title: "Fix the website",
    who: "Feature 1 · for agents that browse",
    body: "Factory Droid edits the store's search page so browsing agents find the answer sooner.",
    key: "website",
  },
  {
    href: "/commands",
    title: "Shop commands",
    who: "Feature 2 · for agents that use tools",
    body: "Droid writes commands that answer straight from the catalog, for any agent through MCP.",
    key: "commands",
  },
  {
    href: "/results",
    title: "Results",
    who: "Same agent, same task",
    body: "All three ways in, raced back to back. A purchase counts only if the real cart is right.",
    key: "results",
  },
] as const;

export default async function Overview() {
  // Render per request so newly saved results show up without a rebuild.
  await connection();
  const since = await demoStart();
  const [session, recorded, benchmark, done] = await Promise.all([
    latestThreeWay({ since }),
    latestThreeWay(),
    latestBenchmark(),
    progress(),
  ]);
  const shown = session ?? recorded;
  const model = shown?.result.model ?? benchmark?.result.model;

  return (
    <Page>
      <section className="grid items-center gap-10 pt-12 pb-6 lg:grid-cols-[1.15fr_minmax(0,560px)]">
        <div className="space-y-5">
          <h1 className="text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-[3.4rem]">
            What does it cost an AI agent to buy the right shoe?
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted">
            AI agents are starting to shop for people, but stores are built for human eyes. Perry measures a real agent
            on a store, then has Factory Droid fix the store two ways. Every purchase is checked against the store&apos;s
            real cart.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <Link
              href="/measure"
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-ground transition-colors hover:bg-perry-deep"
            >
              Start the measurement
              <ArrowRightIcon />
            </Link>
            <span className="text-sm text-faint">
              Demo shoe store on{" "}
              <a href={STORE_URL} className="font-mono underline decoration-seam underline-offset-2 hover:text-ink">
                {host(STORE_URL)}
              </a>
              {model && (
                <>
                  {" "}
                  · agent <span className="font-mono">{model}</span>
                </>
              )}
            </span>
          </div>
        </div>
        {shown?.result.agentInterface && shown.result.patched ? (
          <TimingTower
            entries={[
              { label: "Original website", sub: "browsing, no changes", a: averages(shown.result.baseline.runs), baseline: true },
              { label: "Fixed website", sub: "Feature 1", a: averages(shown.result.patched.runs) },
              { label: "Shop commands", sub: "Feature 2", a: averages(shown.result.agentInterface.runs) },
            ]}
            status={<TowerStatus session={session !== null} />}
          />
        ) : (
          <p className="rounded-2xl bg-carbon p-6 text-carbon-muted">
            No comparison recorded yet. Run the steps, then race all three ways in on Results.
          </p>
        )}
      </section>

      <section aria-labelledby="how-heading" className="space-y-5 pt-6">
        <h2 id="how-heading" className="text-lg font-semibold tracking-tight">
          How Perry works
        </h2>
        <ol className="relative grid gap-8 md:grid-cols-4 md:gap-6">
          <span aria-hidden className="absolute top-[11px] right-[12%] left-3 hidden h-px bg-seam md:block" />
          {track.map((t) => {
            const finished = done[t.key];
            return (
              <li key={t.href} className="relative space-y-2">
                <span
                  className={`relative flex h-6 w-6 items-center justify-center rounded-full border ${
                    finished ? "border-perry bg-perry text-white" : "border-seam bg-panel"
                  }`}
                >
                  {finished ? (
                    <StateMark state="done" className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <span className="sr-only">not done yet</span>
                  )}
                </span>
                <Link href={t.href} className="block pt-1 text-base font-semibold hover:text-perry-deep">
                  {t.title}
                </Link>
                <p className="text-xs font-medium text-faint">{t.who}</p>
                <p className="text-sm leading-relaxed text-muted">{t.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <Pager next={{ href: "/measure", label: "Step 1: Measure" }} />
    </Page>
  );
}
