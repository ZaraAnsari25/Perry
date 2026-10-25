// Scripted "Droid output" for testing the interface gates without Droid.
// Results made with these are marked provenance "fixture".

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { GENERATED_INTERFACE_FILE } from "./generate-interface.ts";

async function write(worktree: string, path: string, text: string) {
  await mkdir(dirname(join(worktree, path)), { recursive: true });
  await writeFile(join(worktree, path), text);
}

export const SIMULATED_INTERFACES = {
  "outside-allowlist": {
    description: "writes the generated file and also edits the storefront's search module",
    apply: async (worktree: string) => {
      await write(worktree, GENERATED_INTERFACE_FILE, "export async function runShop() {\n  return { stdout: \"\", stderr: \"\", exitCode: 1 };\n}\n");
      await write(worktree, "apps/storefront/lib/search.ts", "// changed by the scripted output\n");
    },
  },
  "imports-handwritten": {
    description: "re-exports the hand-written runShop instead of implementing it",
    apply: (worktree: string) => write(worktree, GENERATED_INTERFACE_FILE, 'export { runShop } from "../core.ts";\n'),
  },
} as const;

export type SimulatedInterfaceName = keyof typeof SIMULATED_INTERFACES;
