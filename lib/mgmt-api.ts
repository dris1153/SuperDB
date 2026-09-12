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

export class MgmtError extends Error {
  // Assigned rather than declared as a parameter property: Node's type stripping, which runs the
  // tests, rejects that syntax.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
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
