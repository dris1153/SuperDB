import "server-only";
import { dbOverview } from "./db-introspect";
import { resolveProject } from "./inventory";
import type { ApiKey } from "./mgmt-api";
import {
  getLegacyKeys,
  getDiskUtil,
  getHealth,
  getMetricsText,
  getPoolerConfig,
  listAddons,
  listApiKeys,
  listBackups,
  listBranches,
  listMigrations,
  listSigningKeys,
  getAuthConfig,
  getStorageConfig,
  queryLogs,
  MgmtError,
} from "./mgmt-api";
import { listTables } from "./db-introspect";
import {
  asInterval,
  buildFiguresSql,
  buildSampleSql,
  bucketUnit,
  figuresFor,
  parseLogTime,
  SAMPLE_LIMIT,
  toCards,
  windowMinutes,
  type FigureRow,
  type LogEntry,
} from "./logs-sql";
import { generationOf, partKey, PART_TTL_MS, readCached, writeCached } from "./part-cache";
import { toRow, type KeyRow } from "./api-keys";
import type { SigningKeysPart } from "./signing-keys";
import type { Part } from "./project-part-names";
import { memoryUsedPercent, parseMetrics } from "./prometheus";
import { savedQueries } from "./saved-queries";
import { describeTable, listPolicies, listSchemas, listTablesIn, type Policy } from "./table-editor";
import { bucketNameProblem, countBucketPolicies, type BucketRow } from "./buckets";
import type { StorageObject } from "./storage-objects";
import { listObjects, listStorageBuckets } from "./storage-api";
import { tableDefinition } from "./table-ddl";
import { rowCount, selectRows, type RowCount } from "./table-rows";
import { parseFilters } from "./table-filter";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, parseSort } from "./table-view";
import { clampInt } from "./sql-ident";
import { highlight } from "./highlight";
import { getExposedSchemas } from "./mgmt-api";
import { attempt, type Attempt } from "./safe";
import { requireUser } from "./supabase/server";

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
   * **What `reveal=false` actually does, measured 2026-09-25:** it masks the *new* `secret` key and
   * leaves the legacy `service_role` JWT complete — the one that bypasses RLS. So the flag is a
   * boundary for one key type and not for the other, which is another way of saying it was never
   * the boundary here. This list is.
   */
  "api-keys": async (t, ref): Promise<KeySummary[]> =>
    (await listApiKeys(t, ref)).map(({ id, name, prefix }) => ({ id, name, prefix })),

  /**
   * The settings page's wider shape: type, description and prefix for every key, plus the value of
   * the two that are meant to be public.
   *
   * A second name rather than a wider `api-keys`, because the narrow one is what four other places
   * already rely on and widening it in place would hand them fields they never asked to be trusted
   * with. `toRow` is where the line is drawn, and it has tests.
   */
  "api-key-rows": async (t, ref): Promise<KeyRow[]> => (await listApiKeys(t, ref)).map(toRow),

  /**
   * Passed through rather than picked, unlike its neighbours.
   *
   * The body carries `purgeCache`, `capabilities` and `external.upstreamTarget`, none of which this
   * app models and none of which is a credential — measured 2026-09-25. Picking fields here would
   * mean this page shows less of a project's storage config than the project has, for no gain.
   */
  "storage-config": (t, ref) => getStorageConfig(t, ref),

  /**
   * One folder of one bucket.
   *
   * `t` is unused: this is the project's own Storage API, which does not accept the account token —
   * `lib/project-key.ts` supplies the credential instead.
   *
   * The parameters come from a browser, so they are bounded here as well as escaped downstream. A
   * prefix and a search term travel in the request body rather than the URL, so neither can escape
   * the bucket — but neither needs to be a megabyte either.
   */
  objects: async (_t, ref, search): Promise<StorageObject[]> => {
    const bucket = search.get("bucket") ?? "";
    if (bucketNameProblem(bucket)) return [];

    const listed = await listObjects(ref, bucket, {
      prefix: (search.get("prefix") ?? "").slice(0, 1024),
      search: (search.get("q") ?? "").slice(0, 200) || undefined,
      limit: PAGE,
    });

    // Picked rather than passed through, for the reason the reader below states: `call()` casts
    // over `JSON.parse`, so the declared type is a subset of the body and not a filter.
    return listed.map(({ name, id, created_at, updated_at, metadata }) => ({
      name,
      id,
      created_at,
      updated_at,
      metadata: metadata ? { size: metadata.size, mimetype: metadata.mimetype } : null,
    }));
  },

  /**
   * The policies on both storage tables.
   *
   * Two reads, resolved together. They are separate tables and neither is optional: `objects` holds
   * everything about who may touch a file, `buckets` holds the much rarer policies about listing
   * buckets at all, and the tab shows both because the original does.
   */
  "storage-policies": async (t, ref): Promise<{ objects: Policy[]; buckets: Policy[] }> => {
    const [objects, buckets] = await Promise.all([
      listPolicies(t, ref, "storage", "objects"),
      listPolicies(t, ref, "storage", "buckets"),
    ]);

    return { objects, buckets };
  },

  /**
   * Buckets, each with the number of policies naming it.
   *
   * Two sources, and neither is optional: the buckets come from the project's Storage API, which is
   * the only thing that knows their settings, and the policy count is a SQL question about
   * `storage.objects`. Resolved together so the browser makes one request rather than walking a
   * chain — the rule the table editor set.
   *
   * The policy read is allowed to fail on its own: a connection that cannot run SQL should still
   * see its buckets, with the count left at zero.
   */
  buckets: async (t, ref): Promise<BucketRow[]> => {
    const [buckets, policies] = await Promise.all([
      listStorageBuckets(ref),
      listPolicies(t, ref, "storage", "objects").catch(() => []),
    ]);

    // Fields picked rather than spread. `call()` casts over `JSON.parse`, so `StorageBucket` is a
    // subset of the body and not a filter — the measured response also carries `owner`, which this
    // page has no use for.
    return buckets.map(
      ({ id, name, public: isPublic, type, file_size_limit, allowed_mime_types, created_at, updated_at }) => ({
        id,
        name,
        public: isPublic,
        type,
        file_size_limit,
        allowed_mime_types,
        created_at,
        updated_at,
        policies: countBucketPolicies(policies, id),
      }),
    );
  },

  /** A single boolean, and the only thing this endpoint holds. */
  "legacy-api-keys": (t, ref) => getLegacyKeys(t, ref),

  /**
   * Signing keys carry no credential: `private_jwk` is accepted when one is created and never
   * returned on a read — measured 2026-09-25 — and `public_jwk` is served from the project's public
   * JWKS anyway. The fields are picked all the same, because a `SigningKey` type is a subset of the
   * body and not a filter: `call()` passes whatever arrived straight through. `public_jwk` is left
   * out because nothing renders it.
   */
  "signing-keys": async (t, ref): Promise<SigningKeysPart> => {
    // Two calls, one part. The browser never walks a chain: `jwt_exp` decides what the revoke
    // confirm says about how long old tokens live, and a second round trip for one integer would
    // put that sentence on screen after the dialog it belongs in.
    const [keys, jwtExp] = await Promise.all([listSigningKeys(t, ref), safeJwtExp(t, ref)]);

    return {
      keys: keys.map(({ id, algorithm, status, created_at, updated_at }) => ({
        id,
        algorithm,
        status,
        created_at,
        updated_at,
      })),
      jwtExp,
    };
  },
  metrics: async (t, ref) => ({ memoryPercent: memoryUsedPercent(parseMetrics(await getMetricsText(t, ref))) }),
  /** What the sidebar lists, and whether PostgREST serves the schema the user is looking at. */
  schemas: async (t, ref) => {
    const [schemas, exposed] = await Promise.all([listSchemas(t, ref), safeExposed(t, ref)]);
    return { schemas, exposed };
  },

  "schema-tables": (t, ref, search) => listTablesIn(t, ref, schemaOf(search)),

  columns: (t, ref, search) => describeTable(t, ref, schemaOf(search), tableOf(search)),

  policies: (t, ref, search) => listPolicies(t, ref, schemaOf(search), tableOf(search)),

  definition: async (t, ref, search) => {
    const built = await tableDefinition(t, ref, schemaOf(search), tableOf(search));
    if (!built) return null;
    // Highlighted here, not in the browser: `lib/highlight.ts` is server-only precisely so Shiki's
    // grammars and WASM never ship, and colouring one tab is not worth a megabyte on this route.
    return { ddl: built.ddl, html: await highlight(built.ddl, "sql"), complete: built.complete };
  },

  /**
   * A page of rows, and how many there are.
   *
   * Four upstream calls, all of them on the server, because each one needs the answer before it:
   * the table's entry says what kind of relation it is, the columns decide what may be selected,
   * sorted and filtered, and only then can the rows and the count be asked for. Moving that chain
   * into the browser would turn four server-side hops into four round trips, on the page people
   * spend the most time on — which is why the plan's rule is that a part may make several calls but
   * the browser never walks a chain.
   *
   * Sort keys and filters naming a column that does not exist are dropped **here**, against the
   * catalog, not wherever the URL came from. Quoting keeps a hostile name inert; this keeps an
   * unknown one from being asked about at all.
   */
  rows: async (t, ref, search) => {
    const schema = schemaOf(search);
    const table = tableOf(search);

    const entry = (await listTablesIn(t, ref, schema)).find((e) => e.name === table);
    if (!entry) return null;

    const columns = await describeTable(t, ref, schema, table);
    const known = new Set(columns.map((c) => c.name));
    const sort = parseSort(search.get("sort")).filter((k) => known.has(k.column));
    const filters = parseFilters(search.getAll("filter")).filter((f) => known.has(f.column));
    const searchText = (search.get("q") ?? "").trim();

    const size = PAGE_SIZES.includes(Number(search.get("size")) as (typeof PAGE_SIZES)[number])
      ? Number(search.get("size"))
      : DEFAULT_PAGE_SIZE;
    const requested = clampInt(search.get("page"), 1, Number.MAX_SAFE_INTEGER, 1);

    // Counting is allowed to fail on its own: it runs a real `count(*)` under the ceiling, and a
    // statement timeout there used to cost the page nothing — the footer just showed no total. Now
    // that the count shares a part with the rows, an unwrapped throw would refuse both.
    const total = await rowCount(t, ref, schema, table, {
      kind: entry.kind,
      estimate: entry.est_rows,
      columns,
      filters,
      search: searchText,
    }).catch((): RowCount => ({ n: null, exact: false }));

    // Land on the last real page rather than rendering "Page 900 of 3" over an empty grid. Only
    // possible where the count is known — a view has no last page to clamp to.
    const last = total.n == null ? null : Math.max(1, Math.ceil(total.n / size));
    const page = last == null ? requested : Math.min(requested, last);

    // Without columns there is nothing to order by, and an unordered LIMIT/OFFSET pages
    // non-deterministically — better to fetch nothing than to fetch wrong.
    const rows =
      columns.length === 0
        ? []
        : await selectRows(t, ref, schema, table, {
            columns,
            sort,
            filters,
            search: searchText,
            limit: size,
            offset: (page - 1) * size,
          });

    return { rows, total, page, size };
  },

  /**
   * The only reader that does not touch the Management API: saved queries live in this app's own
   * database, behind RLS, and `savedQueries` already scopes them to the caller. The project's
   * ownership is still checked first — `readPart` resolves it before any reader runs — so a ref the
   * user has no connection to answers 404 rather than an empty list.
   */
  "saved-queries": async (_t, ref) =>
    savedQueries(ref).catch(() => {
      // Deliberately not the Postgres message. Every other reader's reason comes from the user's own
      // project and is theirs to act on; this one comes from *this app's* database, where
      // `relation "public.saved_queries" does not exist` is a deployment detail, not an instruction.
      throw new Error("Saved queries are unavailable on this instance.");
    }),

  logs: async (t, ref, search) => {
    const minutes = windowMinutes(asInterval(search.get("interval")));
    const to = Date.now();
    const from = to - minutes * 60_000;
    const unit = bucketUnit(minutes);

    const ask = <T>(sql: string) =>
      queryLogs<T>(t, ref, sql, new Date(from).toISOString(), new Date(to).toISOString());

    // Two requests, not one: the figures are counted over the whole window and the rows are only
    // the shape of it. They cannot be the same statement — the row read is capped at 1000 and the
    // aggregate is not.
    const [rows, entries] = await Promise.all([
      ask<FigureRow>(buildFiguresSql()),
      ask<LogEntry>(buildSampleSql()),
    ]).catch((e: unknown) => {
      // `ThrottlerException: Too Many Requests` is all the endpoint says, and a reader cannot act on
      // that. Nothing retries into it, so waiting is the whole fix.
      if (e instanceof MgmtError && e.status === 429) {
        throw new Error("Log queries are rate limited. Wait a minute, then reload.");
      }
      throw e;
    });

    const figures = figuresFor(rows);
    // Exactly the cap means the window was cut, and the sample arrives newest first, so its last
    // row is where the bars really begin.
    const sampledFrom =
      entries.length >= SAMPLE_LIMIT ? parseLogTime(entries[entries.length - 1].timestamp) : null;

    return { from, to, sampledFrom, cards: toCards(entries, { from, to, unit }, figures) };
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

  // After `resolveProject`, never before: the cache is read only once this user is known to own a
  // connection to this project. Reading it first would answer from memory for a ref the caller has
  // since lost access to.
  const { user } = await requireUser();
  const ttl = PART_TTL_MS[part];
  const key = partKey(user.id, ref, part, search);

  const hit = readCached(key, ttl);
  if (hit) return { ok: true, data: hit.value };

  // Read before the call, checked when it lands: a write that commits during these 800–1200ms
  // invalidates what this request is about to return, and storing it anyway would put the pre-write
  // state back for a full TTL.
  const generation = generationOf(ref);
  const result = await attempt(() => READERS[part](found.token, ref, search));

  // Successes only. A refusal is usually something the reader can fix — a missing OAuth scope, a
  // paused project — and a cached one would survive the fix, so re-authorising would appear to
  // change nothing.
  if (result.ok) writeCached(key, result.data, ttl, ref, generation);
  return result;
}

/** Identity is the one part that needs no upstream call: `resolveProject` already has it. */
/** What the `identity` part answers with. `import type` from here is erased, as `KeySummary` is. */
export type Identity = NonNullable<Awaited<ReturnType<typeof readIdentity>>>;

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
/**
 * An unreadable `jwt_exp` is `null`, not a default.
 *
 * The revoke confirm turns this into "tokens expire within an hour"; guessing 3600 when the config
 * could not be read would put a specific promise in front of the one irreversible action here.
 */
const safeJwtExp = (t: string, ref: string) =>
  getAuthConfig(t, ref).then(
    // Checked, not just defaulted. `call()` casts over `JSON.parse`, so a `jwt_exp` that is not a
    // number would otherwise reach the confirm and be printed — "last NaN hours" is worse than
    // admitting the value could not be read.
    (config) => (typeof config?.jwt_exp === "number" && Number.isFinite(config.jwt_exp) ? config.jwt_exp : null),
    () => null,
  );

/** The sidebar renders an unknown exposure as no icon at all rather than guessing. */
const safeExposed = (t: string, ref: string) =>
  getExposedSchemas(t, ref).then(
    (schemas) => schemas,
    () => null,
  );

/**
 * One folder's worth.
 *
 * A folder with more objects than this is truncated, and the browser says so rather than implying
 * the listing is complete. There is no pager: `/object/list` takes an offset, but a folder that
 * needs paging is a folder nobody should be reading through a settings page.
 */
const PAGE = 200;

const schemaOf = (search: URLSearchParams) => search.get("schema") ?? "public";
const tableOf = (search: URLSearchParams) => search.get("table") ?? "";
