import { connection } from "next/server";

import { CommandsSection } from "../agent-interface-panel";
import { Page, PageHeader, Pager } from "../ui";

export default async function Commands() {
  await connection();
  return (
    <Page>
      <PageHeader
        title="Skip the web pages: give agents the store's catalog directly"
        audience="Feature 2 · an even better way, for agents that use tools"
        tone="blue"
      >
        Fixing the website helped, but the agent still has to read pages built for people. Every online store already
        keeps all the answers in one place, its product catalog; the website is that catalog drawn as pages. So for agents
        that can use tools (Claude Desktop, Claude Code, coding agents), Perry has Factory Droid build a direct line to the
        catalog: a few <code className="font-mono">shop</code> commands that answer straight from it. The website stays
        exactly as it is.
      </PageHeader>
      <CommandsSection now={Date.now()} />
      <Pager back={{ href: "/website", label: "Feature 1: Fix the website" }} next={{ href: "/results", label: "Results" }} />
    </Page>
  );
}
