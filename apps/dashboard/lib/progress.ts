// What's been done in this demo session, for the step bar on every page.

import { liveWorktree } from "@/lib/child-process";
import { demoStart, latestInterfaceGen, latestThreeWay } from "@/lib/interface";
import { latestBenchmark } from "@/lib/results";

export interface Progress {
  measure: boolean;
  website: boolean;
  commands: boolean;
  results: boolean;
}

export async function progress(): Promise<Progress> {
  const since = await demoStart();
  const [benchmark, live, gen, compared] = await Promise.all([
    latestBenchmark(),
    liveWorktree(),
    latestInterfaceGen({ since }),
    latestThreeWay({ since }),
  ]);
  return {
    // Step 1 is the recorded baseline: done once one exists.
    measure: benchmark !== null,
    website: live !== undefined,
    commands: gen?.status === "accepted",
    results: compared !== null,
  };
}
