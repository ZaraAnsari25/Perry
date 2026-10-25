import { connection } from "next/server";

import { CommandsSection } from "../agent-interface-panel";
import { Page, PageHeader, Pager } from "../ui";

export default async function Commands() {
  await connection();
  return (
    <Page>
      <PageHeader
        title="Give agents a direct line to the store"
        audience="Feature 2 · for the agent-first internet"
        tone="blue"
      >
        Feature 1 makes today&apos;s websites work better for agents. Feature 2 is built for the agent-first internet, where
        agents skip pages made for people and ask the store directly. Every online store already keeps its answers in one
        place, its product catalog. So for agents that can use tools (Claude Desktop, Claude Code, coding agents), Perry has
        Factory Droid build a few <code className="font-mono">shop</code> commands that answer straight from it. The two
        work side by side: the website stays exactly as it is for every agent that still browses.
      </PageHeader>
      <CommandsSection now={Date.now()} />
      <Pager back={{ href: "/website", label: "Feature 1: Fix the website" }} next={{ href: "/results", label: "Results" }} />
    </Page>
  );
}
