import "server-only";

const BASE = "https://api.supabase.com";

export type Project = {
  ref: string;
  name: string;
  region: string;
  created_at: string;
  organization_slug: string;
  status:
    | "INACTIVE" | "ACTIVE_HEALTHY" | "ACTIVE_UNHEALTHY" | "COMING_UP" | "UNKNOWN"
    | "GOING_DOWN" | "INIT_FAILED" | "REMOVED" | "RESTORING" | "UPGRADING"
    | "PAUSING" | "RESTORE_FAILED" | "RESTARTING" | "PAUSE_FAILED" | "RESIZING";
  database?: { host: string; version: string; postgres_engine: string; release_channel: string };
};

export type Org = { id: string; slug: string; name: string };
export type ServiceHealth = { name: string; status: "COMING_UP" | "ACTIVE_HEALTHY" | "UNHEALTHY"; error?: string };
export type DiskUtil = { timestamp: string; metrics: { fs_size_bytes: number; fs_avail_bytes: number; fs_used_bytes: number } };
export type ApiKey = {
  id: string | null;
  name: string;
  type: "legacy" | "publishable" | "secret" | null;
  prefix: string | null;
  /**
   * The real credential. Measured, not assumed: the API returns it at reveal=false too, so callers
   * that only need the publishable key must drop the secret rather than rely on the flag.
   */
  api_key: string | null;
};

export type SigningKeyStatus = "in_use" | "standby" | "previously_used" | "revoked";

export type SigningKey = {
  id: string;
  algorithm: "ES256" | "RS256" | "HS256" | "EdDSA";
  status: SigningKeyStatus;
  /** Null for HS256, which is symmetric and so has no public half to publish. */
  public_jwk: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export class MgmtError extends Error {
  // Assigned rather than declared as a parameter property: Node's type stripping, which runs the
  // tests, rejects that syntax.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Set `SUPERDB_TIMING=1` to log how long each upstream call takes.
 *
 * Every Management API request in the app goes through `call()`, so this is the one place that can
 * answer "which call is the page waiting for" without guessing. Off by default: it writes a line per
 * request, and the path can carry a project ref.
 */
const TIMING = process.env.SUPERDB_TIMING === "1";

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const started = TIMING ? performance.now() : 0;
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (TIMING) {
    // Before the body is read, because that is the wait the page is blocked on.
    console.log(`[timing] ${Math.round(performance.now() - started)}ms ${res.status} ${path.split("?")[0]}`);
  }
  if (!res.ok) {
    // The token lives in a header, so the request text is safe to surface.
    //
    // Generous cap on purpose. It used to be 300, which cut Supabase's own explanations mid-JSON —
    // one runs to 299 characters before the path and status are prefixed — and describe() then
    // failed to parse what it was handed and fell back to a bare "Forbidden". The bound that
    // matters for reading is applied there, after parsing; this one only stops a runaway body.
    const detail = await res.text().catch(() => "");
    throw new MgmtError(res.status, `${path} → ${res.status} ${detail}`.slice(0, 2000));
  }
  // Not every success carries a body. POST /restore answers 200 with nothing at all, and calling
  // json() on that throws "Unexpected end of JSON input" — a parse failure that reads like the
  // request failed when it actually succeeded. Text with broken JSON in it still throws, since that
  // is a real fault.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const listProjects = (t: string) => call<Project[]>(t, "/v1/projects");
export const listOrgs = (t: string) => call<Org[]>(t, "/v1/organizations");
export const getProject = (t: string, ref: string) => call<Project>(t, `/v1/projects/${ref}`);
export const getDiskUtil = (t: string, ref: string) => call<DiskUtil>(t, `/v1/projects/${ref}/config/disk/util`);
/** reveal returns the actual key values; leave it false unless the user asked to see them. */
export const listApiKeys = (t: string, ref: string, reveal = false) =>
  call<ApiKey[]>(t, `/v1/projects/${ref}/api-keys?reveal=${reveal}`);

/**
 * One key rather than the whole list, for the reveal path.
 *
 * Asking for all four when the user clicked one row would put three credentials they did not ask for
 * through this process to reach the one they did.
 */
export const getApiKey = (t: string, ref: string, id: string, reveal: boolean) =>
  call<ApiKey>(t, `/v1/projects/${ref}/api-keys/${id}?reveal=${reveal}`);

/**
 * Creating a key. `type` is fixed at creation — `PATCH` accepts only the other three fields.
 *
 * The 201 carries the new key already masked, measured 2026-09-25, so there is no one-time reveal at
 * creation the way some platforms do it. A "copy it now, you will not see it again" flow would be a
 * lie here.
 */
export const createApiKey = (
  t: string,
  ref: string,
  body: { type: "publishable" | "secret"; name: string; description?: string },
) => call<ApiKey>(t, `/v1/projects/${ref}/api-keys`, { method: "POST", body: JSON.stringify(body) });

export const updateApiKey = (
  t: string,
  ref: string,
  id: string,
  body: { name?: string; description?: string },
) =>
  call<ApiKey>(t, `/v1/projects/${ref}/api-keys/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

/**
 * Whether this project still issues the legacy `anon` and `service_role` JWTs.
 *
 * One flag for both — there is no per-key switch. Measured 2026-09-25: `GET` answers
 * `{"enabled": true}`, and `PUT` takes `enabled` as a **required query parameter**, not a body.
 */
export const getLegacyKeys = (t: string, ref: string) =>
  call<{ enabled: boolean }>(t, `/v1/projects/${ref}/api-keys/legacy`);

export const setLegacyKeys = (t: string, ref: string, enabled: boolean) =>
  call<{ enabled: boolean }>(t, `/v1/projects/${ref}/api-keys/legacy?enabled=${enabled}`, {
    method: "PUT",
  });

/** Answers 200 with the deleted key, masked. `was_compromised` and `reason` are optional. */
export const deleteApiKey = (t: string, ref: string, id: string) =>
  call<ApiKey>(t, `/v1/projects/${ref}/api-keys/${id}`, { method: "DELETE" });

/**
 * The keys that sign this project's JWTs.
 *
 * Wraps its array in `{keys}`, unlike `/api-keys` right next to it — measured 2026-09-25. Unwrapped
 * here so that one difference is not something every call site has to remember.
 */
export const listSigningKeys = async (t: string, ref: string) => {
  const body = await call<{ keys: SigningKey[] }>(t, `/v1/projects/${ref}/config/auth/signing-keys`);
  // Not `body?.keys ?? []`: on a bare array that reads `Array.prototype.keys`, a function, which is
  // truthy and would travel on as if it were the list.
  return Array.isArray(body?.keys) ? body.keys : [];
};

/**
 * A new signing key.
 *
 * `status` is always `standby` from this app: a key created straight into `in_use` would begin
 * signing before anyone confirmed a rotation. The API also accepts `private_jwk` here, importing a
 * key rather than generating one, which this app deliberately does not offer.
 */
export const createSigningKey = (
  t: string,
  ref: string,
  // The literal union rather than `SigningAlgorithm` from `lib/signing-keys.ts`: that module imports
  // a type back from this one, and a value import in either direction would make a real ESM cycle in
  // the server-only layer.
  body: { algorithm: "ES256" | "RS256"; status: "standby" },
) =>
  call<SigningKey>(t, `/v1/projects/${ref}/config/auth/signing-keys`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/**
 * Moving a key through its lifecycle.
 *
 * Promoting a standby to `in_use` **also** demotes the key that was in use to `previously_used` —
 * one request, measured 2026-09-25, not two. There is no state where both are in use.
 */
export const updateSigningKeyStatus = (t: string, ref: string, id: string, status: SigningKeyStatus) =>
  call<SigningKey>(t, `/v1/projects/${ref}/config/auth/signing-keys/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

/**
 * Removing a key for good.
 *
 * Refused unless the key is `revoked`, and refused again for thirty days after it was — both 422,
 * and the second one names the date. Measured 2026-09-25. Nothing here anticipates either: the
 * caller shows what came back.
 */
export const deleteSigningKey = (t: string, ref: string, id: string) =>
  call<SigningKey>(t, `/v1/projects/${ref}/config/auth/signing-keys/${id}`, { method: "DELETE" });

/**
 * The auth config, for `jwt_exp` alone.
 *
 * How long a token stays valid is how long a retired signing key still has work to do, so it is the
 * wait before revoking one is safe. It is configurable per project — 3600 on the two measured — and
 * a page that assumed an hour would be wrong on any project that changed it. There is no
 * `jwt_secret` field here, despite what the legacy tab's Reveal control would suggest.
 */
export const getAuthConfig = (t: string, ref: string) =>
  call<{ jwt_exp?: number }>(t, `/v1/projects/${ref}/config/auth`);

/**
 * Everything this app knows about a project's storage, in one response.
 *
 * Four screens read from it: the size limit and transformation flag are the Settings tab, the S3
 * page's toggle is `features.s3Protocol`, and whether Analytics and Vectors exist for this project
 * at all is `icebergCatalog.enabled` and `vectorBuckets.enabled` — the project's own flags rather
 * than a guess from its plan name.
 *
 * Note what is *not* here: buckets and objects. The Management API has three storage paths in total
 * and none of them reaches an object. See `plans/reports/260925-storage-api-measured.md`.
 */
export type StorageConfig = {
  fileSizeLimit: number;
  features?: {
    imageTransformation?: { enabled: boolean };
    s3Protocol?: { enabled: boolean };
    icebergCatalog?: { enabled: boolean };
    vectorBuckets?: { enabled: boolean };
  };
  capabilities?: { list_v2?: boolean };
};

export const getStorageConfig = (t: string, ref: string) =>
  call<StorageConfig>(t, `/v1/projects/${ref}/config/storage`);

/**
 * Writing the storage config. Measured 2026-09-25, and not what it looks like:
 *
 * - The **top level merges** — a field not sent is left alone.
 * - **`features` merges by key** — a feature not sent is left alone. An earlier version of this
 *   comment claimed the opposite and prescribed read-merge-write, which is now the one thing
 *   guaranteed to fail.
 * - A feature **sub-object is validated in full**. Sending `{icebergCatalog: {enabled}}` without its
 *   `maxNamespaces`, `maxTables` and `maxCatalogs` is refused with a 400 naming each missing field.
 *
 * Hence the body type below: only the two features that carry nothing but `enabled` can be written
 * at all, so the type says so rather than letting a caller compose a payload the API always
 * refuses.
 */
export const updateStorageConfig = (
  t: string,
  ref: string,
  body: {
    fileSizeLimit?: number;
    features?: {
      imageTransformation?: { enabled: boolean };
      s3Protocol?: { enabled: boolean };
    };
  },
) =>
  call<StorageConfig>(t, `/v1/projects/${ref}/config/storage`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

const SERVICES = ["auth", "db", "pooler", "realtime", "rest", "storage"] as const;
// No timeout_ms: the API validates it as a number and rejects the query string with a 400.
export const getHealth = (t: string, ref: string) =>
  call<ServiceHealth[]>(t, `/v1/projects/${ref}/health?services=${SERVICES.join(",")}`);

/**
 * Read-only SQL. Runs as `supabase_read_only_user`, which holds `rolbypassrls`, so results are not
 * RLS-filtered.
 *
 * Every query this repo *builds* schema-qualifies its references, and should keep doing so: the
 * schema is chosen by the caller, and resolving it through a search path would make the target
 * depend on a role's configuration. But the endpoint does not require it — measured 2026-09-13 with
 * scripts/probe-query-errors.mjs, `search_path` here is `"$user", public`, and an unqualified
 * reference to a public table answers 201. That matters because the SQL editor sends whatever the
 * user typed through this endpoint first.
 */
export const readOnlyQuery = <T = Record<string, unknown>>(t: string, ref: string, query: string) =>
  call<T[]>(t, `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });

export type Addon = {
  type: "compute_instance" | "custom_domain" | "pitr" | "ipv4" | string;
  variant: { id: string; name: string };
};
export type Branch = { id: string; name: string; is_default: boolean; status: string; created_at: string };
export type Migration = { version: string; name?: string };
export type Backup = { id: number; status: string; inserted_at: string; is_physical_backup: boolean };
export type BackupsResponse = { region: string; pitr_enabled: boolean; backups: Backup[] };

/** The four series the API actually reports. Supabase's own chart row also folds in log-derived ones. */


export const listAddons = (t: string, ref: string) =>
  call<{ selected_addons: Addon[] }>(t, `/v1/projects/${ref}/billing/addons`);
export const listBranches = (t: string, ref: string) =>
  call<Branch[]>(t, `/v1/projects/${ref}/branches`);
export const listMigrations = (t: string, ref: string) =>
  call<Migration[]>(t, `/v1/projects/${ref}/database/migrations`);
/**
 * Sets the project's database password. **The one call in this app that carries a secret in its
 * request body** — everywhere else the vault hands this server ciphertext it cannot read.
 *
 * Safe here by structure rather than by intent, and worth knowing before changing any of it: the
 * error thrown below is built from the URL path and the *response* body, never the request; the
 * `SUPERDB_TIMING` line logs milliseconds, status and path; and this repo has no `middleware.ts` or
 * `instrumentation.ts`, so there is no `onRequestError` and no proxy-layer body logging. Adding
 * either re-opens the question.
 */
export const updateDatabasePassword = (t: string, ref: string, password: string) =>
  call<void>(t, `/v1/projects/${ref}/database/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });

/** The only field this endpoint accepts. Spec: `name` required, 1-256 characters. */
export const updateProjectName = (t: string, ref: string, name: string) =>
  call<Project>(t, `/v1/projects/${ref}`, { method: "PATCH", body: JSON.stringify({ name }) });

/** Resuming a paused project. No request body — the ref is the whole request. */
export const restoreProject = (t: string, ref: string) =>
  call<void>(t, `/v1/projects/${ref}/restore`, { method: "POST" });

export const listBackups = (t: string, ref: string) =>
  call<BackupsResponse>(t, `/v1/projects/${ref}/database/backups`);
/**
 * Logflare SQL over the project's log sources.
 *
 * Answers 200 with `error` populated when the SQL itself is wrong, so a caller has to read the
 * envelope rather than trust the status line.
 */
export async function queryLogs<T>(
  t: string,
  ref: string,
  sql: string,
  startIso: string,
  endIso: string,
): Promise<T[]> {
  const query = new URLSearchParams({
    sql,
    iso_timestamp_start: startIso,
    iso_timestamp_end: endIso,
  });
  const body = await call<{ result: T[] | null; error: string | null }>(
    t,
    `/v1/projects/${ref}/analytics/endpoints/logs.all?${query}`,
  );
  if (body.error) throw new MgmtError(400, `logs.all → ${body.error}`);
  return body.result ?? [];
}


/** Prometheus exposition format, not JSON — parse it with lib/prometheus.ts. */
export async function getMetricsText(token: string, ref: string): Promise<string> {
  const res = await fetch(`${BASE}/v1/projects/${ref}/analytics/endpoints/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  // The body is deliberately not in the message. `describe` in `lib/safe.ts` prefers a JSON body's
  // own text over its curated sentences, and the one written for this endpoint's 10-per-minute
  // limit is more use than whatever the gateway says.
  if (!res.ok) throw new MgmtError(res.status, `metrics → ${res.status}`);
  return res.text();
}

export type PoolerConfig = {
  database_type: "PRIMARY" | "READ_REPLICA";
  db_host: string;
  db_port: number;
  db_name: string;
  db_user: string;
  pool_mode: string;
  connection_string: string;
};

export const getPoolerConfig = (t: string, ref: string) =>
  call<PoolerConfig[]>(t, `/v1/projects/${ref}/config/database/pooler`);

/**
 * Which schemas PostgREST actually exposes. The Table Editor marks those tables as reachable through
 * the API; guessing "public" would be wrong on any project that changed the setting.
 *
 * The endpoint also returns `jwt_secret`. Only the schema list is returned here so that no caller can
 * hand the whole response to a client component by accident — the same hazard `ApiKey.api_key`
 * carries above.
 */
export async function getExposedSchemas(t: string, ref: string): Promise<string[]> {
  const config = await call<{ db_schema: string }>(t, `/v1/projects/${ref}/postgrest`);
  return config.db_schema.split(",").map((s) => s.trim());
}

/**
 * SQL that may write. Runs as `postgres` — full DDL rights, and RLS is bypassed — so nothing should
 * reach here without a preview the user confirmed.
 *
 * The endpoint reports no affected-row count of its own: without `RETURNING` a successful UPDATE
 * answers `[]`, indistinguishable from one that matched nothing. Every statement built for this must
 * end in `RETURNING`, and the caller counts what comes back.
 */
export const writeQuery = <T = Record<string, unknown>>(t: string, ref: string, query: string) =>
  call<T[]>(t, `/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
