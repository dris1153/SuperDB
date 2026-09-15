import "server-only";
import { dbOverview } from "./db-introspect";
import { resolveProject } from "./inventory";
import type { ApiKey } from "./mgmt-api";
import {
  getDiskUtil,
  getHealth,
  getMetricsText,
  getPoolerConfig,
  listAddons,
  listApiKeys,
  listBackups,
  listBranches,
  listMigrations,
  queryLogs,
} from "./mgmt-api";
import { listTables } from "./db-introspect";
import {
  asInterval,
  buildServiceLogsSql,
  bucketUnit,
  toCards,
  windowMinutes,
  type LogRow,
} from "./logs-sql";
import type { Part } from "./project-part-names";
import { memoryUsedPercent, parseMetrics } from "./prometheus";
import { attempt, type Attempt } from "./safe";

/**
 * What the browser may ask for about a project, and how each one is read.
 *
 * **This map is the security boundary.** The route handler looks a request's `part` up in it and can
 * reach nothing else: there is no dynamic dispatch into `lib/mgmt-api.ts`, so a request cannot name
 * a function that was never meant to be reachable from a browser. Its keys are also the client's
 * `Part` type, so a part name that does not exist is a compile error rather than a 404 at runtime.
 *
 * Authorisation is `resolveProject`, which is already the gate for every project-scoped action in
 * the app: it returns a token only for a connection the signed-in user owns.
 *
 * **A reader that reaches a credential must pick its fields, not pass the response through.**
 * `listApiKeys` returns the real key values even at `reveal=false` — measured, and recorded on the
 * `ApiKey` type in `mgmt-api.ts` — so the flag is not a boundary and never was. The `api-keys`
 * reader names the four fields the UI shows, and the secret never leaves the server.
 *
 * The rest pass through what the app already models, which is a weaker claim and worth stating as
 * one: their bodies were read and none carries a credential the page does not already show. The
 * pooler's connection string is the closest call — it is on the Get connected panel by design, with
 * the password left as a placeholder, because Supabase does not return that through its API.
 * `metrics` and `addons` are picked apart because the upstream body is large and the UI reads one
 * number out of it.
 */

type Reader = (token: string, ref: string, search: URLSearchParams) => Promise<unknown>;

/**
 * What an API key looks like once it has left the server.
 *
 * `api_key?: never` is the point of the type. Without it, `ApiKey[]` is structurally assignable to a
 * `Pick<...>[]`, so annotating the reader would not stop someone returning the upstream array
 * verbatim — and the upstream array carries the real key value even at `reveal=false`. With it, that
 * mistake does not compile, which is the only thing standing between a service-role secret and a
 * browser that no test can reach.
 */
export type KeySummary = Pick<ApiKey, "id" | "name" | "prefix"> & { api_key?: never };

/**
 * `Record<Exclude<Part, "identity">, Reader>` rather than a loose object: a name in
 * `project-part-names.ts` with no reader here fails to build, and a reader whose name is not on that
 * list fails too. Identity is excluded because it needs no upstream call — `resolveProject` already
 * has it.
 */
const READERS: Record<Exclude<Part, "identity">, Reader> = {
  // Only the selected ones: the response also carries the whole purchasable catalogue with prices,
  // which the page never reads.
  addons: async (t, ref) => ({ selected_addons: (await listAddons(t, ref)).selected_addons }),
  branches: (t, ref) => listBranches(t, ref),
  migrations: (t, ref) => listMigrations(t, ref),
  backups: (t, ref) => listBackups(t, ref),
  disk: (t, ref) => getDiskUtil(t, ref),
  pooler: (t, ref) => getPoolerConfig(t, ref),
  health: (t, ref) => getHealth(t, ref),
  overview: (t, ref) => dbOverview(t, ref),
  tables: (t, ref) => listTables(t, ref),
  /**
   * The four fields the UI shows, picked by hand.
   *
   * `reveal=false` does **not** hide the key: `mgmt-api.ts` records that the API returns `api_key`
   * either way, and `framework-actions.ts` depends on exactly that. Passing this response through
   * would have put the service-role secret — the one that bypasses RLS — in a plain GET any signed-in
   * browser could issue. The flag was never the boundary; this list is.
   */
  "api-keys": async (t, ref): Promise<KeySummary[]> =>
    (await listApiKeys(t, ref)).map(({ id, name, prefix }) => ({ id, name, prefix })),
  metrics: async (t, ref) => ({ memoryPercent: memoryUsedPercent(parseMetrics(await getMetricsText(t, ref))) }),
  logs: async (t, ref, search) => {
    const minutes = windowMinutes(asInterval(search.get("interval")));
    const to = Date.now();
    const from = to - minutes * 60_000;
    const unit = bucketUnit(minutes);

    const rows = await queryLogs<LogRow>(
      t,
      ref,
      buildServiceLogsSql(unit),
      new Date(from).toISOString(),
      new Date(to).toISOString(),
    );
    return { from, to, cards: toCards(rows, { from, to, unit }) };
  },
};

/**
 * Reads one part, keeping the difference between "this failed" and "this was refused, and here is
 * why" — which is what the disk and memory cards print today. Collapsing a refusal into an HTTP
 * status would replace a reason the user can act on with a shrug.
 */
export async function readPart(
  part: Exclude<Part, "identity">,
  ref: string,
  search: URLSearchParams,
): Promise<Attempt<unknown> | null> {
  const found = await resolveProject(ref);
  if (!found) return null;

  return attempt(() => READERS[part](found.token, ref, search));
}

/** Identity is the one part that needs no upstream call: `resolveProject` already has it. */
export async function readIdentity(ref: string) {
  const found = await resolveProject(ref);
  if (!found) return null;

  const { project, connection } = found;
  return {
    ref: project.ref,
    name: project.name,
    status: project.status,
    region: project.region,
    createdAt: project.created_at,
    connection: connection.display_name,
  };
}
