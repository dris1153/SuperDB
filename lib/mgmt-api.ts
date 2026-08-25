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
  /** Only populated when reveal is true — this is the real credential. */
  api_key: string | null;
};

export class MgmtError extends Error {
  constructor(public status: number, message: string) {
    super(message);
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
    const detail = await res.text().catch(() => "");
    throw new MgmtError(res.status, `${path} → ${res.status} ${detail}`.slice(0, 300));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
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

/** Read-only SQL. The endpoint rejects unqualified entity references, so schema-qualify everything. */
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
export type ApiCountPoint = {
  timestamp: string;
  total_auth_requests: number;
  total_realtime_requests: number;
  total_rest_requests: number;
  total_storage_requests: number;
};

export type UsageInterval = "15min" | "30min" | "1hr" | "3hr" | "1day" | "3day";

export const listAddons = (t: string, ref: string) =>
  call<{ selected_addons: Addon[] }>(t, `/v1/projects/${ref}/billing/addons`);
export const listBranches = (t: string, ref: string) =>
  call<Branch[]>(t, `/v1/projects/${ref}/branches`);
export const listMigrations = (t: string, ref: string) =>
  call<Migration[]>(t, `/v1/projects/${ref}/database/migrations`);
export const listBackups = (t: string, ref: string) =>
  call<BackupsResponse>(t, `/v1/projects/${ref}/database/backups`);
export const getApiCounts = (t: string, ref: string, interval: UsageInterval) =>
  call<{ result: ApiCountPoint[] }>(t, `/v1/projects/${ref}/analytics/endpoints/usage.api-counts?interval=${interval}`);
export const getApiRequestsCount = (t: string, ref: string) =>
  call<{ result: { count: number }[] }>(t, `/v1/projects/${ref}/analytics/endpoints/usage.api-requests-count`);

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
