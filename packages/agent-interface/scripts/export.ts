// Writes the agent's guide to data/results/agent-guide.json for the dashboard.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { catalog } from "../../../apps/storefront/lib/catalog.ts";
import { buildGuide } from "../guide.ts";

const out = join(dirname(fileURLToPath(import.meta.url)), "../../../data/results/agent-guide.json");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify({ provenance: "live", generatedAt: new Date().toISOString(), guide: buildGuide(catalog) }, null, 2)}\n`);
console.log(`Saved ${out}`);
