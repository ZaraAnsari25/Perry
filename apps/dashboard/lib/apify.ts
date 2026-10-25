// Reads recent runs of the Perry audit Actor on Apify, server-side only. The
// token comes from the repo-root .env and never reaches the browser.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BenchmarkResult } from "@agentfix/shared";

import { REPO } from "./child-process";

/** Zara's "Perry agent audit" Actor (packages/apify). Override with APIFY_ACTOR_ID in .env. */
const DEFAULT_ACTOR_ID = "g6UjfNO1py073C5MU";
const API = "https://api.apify.com/v2";

export interface ApifyAudit {
  runId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  consoleUrl: string;
  /** The Actor's OUTPUT record, when the run finished and saved one. */
  output?: BenchmarkResult & { apifyRunId?: string; runLabel?: string };
}

export type ApifyAudits = { ok: true; actor: string; audits: ApifyAudit[] } | { ok: false; reason: string };

/** A value from process.env, or else from the repo-root .env file. */
async function setting(name: string): Promise<string | undefined> {
  if (process.env[name]) return process.env[name];
  const env = await readFile(join(REPO, ".env"), "utf8").catch(() => "");
  return new RegExp(`^${name}=(.+)$`, "m").exec(env)?.[1]?.trim();
}

let cache: { at: number; value: ApifyAudits } | undefined;

/** The Actor's most recent runs with their results, cached for a minute. */
export async function apifyAudits(limit = 5): Promise<ApifyAudits> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const token = await setting("APIFY_TOKEN");
  if (!token) return { ok: false, reason: "APIFY_TOKEN is not set in .env." };
  const actorId = (await setting("APIFY_ACTOR_ID")) ?? DEFAULT_ACTOR_ID;
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Apify returned HTTP ${response.status} for ${path.split("?")[0]}`);
    return (await response.json()) as T;
  };

  try {
    const actor = await get<{ data: { username: string; name: string; title?: string } }>(`/acts/${actorId}`);
    const runs = await get<{
      data: {
        items: { id: string; status: string; startedAt: string; finishedAt?: string; defaultKeyValueStoreId: string }[];
      };
    }>(`/acts/${actorId}/runs?desc=1&limit=${limit}`);
    const audits = await Promise.all(
      runs.data.items.map(async (r): Promise<ApifyAudit> => {
        const output =
          r.status === "SUCCEEDED"
            ? await get<ApifyAudit["output"]>(`/key-value-stores/${r.defaultKeyValueStoreId}/records/OUTPUT`).catch(
                () => undefined,
              )
            : undefined;
        return {
          runId: r.id,
          status: r.status,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          consoleUrl: `https://console.apify.com/view/runs/${r.id}`,
          output,
        };
      }),
    );
    const value: ApifyAudits = { ok: true, actor: actor.data.title ?? `${actor.data.username}/${actor.data.name}`, audits };
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
