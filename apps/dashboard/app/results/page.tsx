import { connection } from "next/server";

import { selectRun } from "@/lib/run-selection";

import { ResultsSection } from "../agent-interface-panel";
import { Page, PageHeader, Pager } from "../ui";

export default async function Results() {
  await connection();
  // Step 1's averages, for the reference line under the comparison.
  const { avg } = await selectRun({});
  const now = Date.now();
  return (
    <Page>
      <PageHeader title="Same agent, same task, three ways in" audience="Results · every purchase verified on the real cart">
        Once both features are in place, Perry runs the agent 5 times each way, back to back, with the same model, task
        and cart check. Only the way into the store changes. A purchase counts only if the store&apos;s real cart holds
        exactly the right shoe.
      </PageHeader>
      <ResultsSection baseline={avg} now={now} />
      <Pager back={{ href: "/commands", label: "Feature 2: Shop commands" }} next={{ href: "/", label: "Back to the overview" }} />
    </Page>
  );
}
