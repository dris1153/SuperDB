import "server-only";

const BASE = "https://api.supabase.com";

export type Profile = { gotrue_id: string; primary_email: string; username: string };

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
export type ApiKey = { id: string | null; name: string; type: string | null; prefix: string | null };

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

export const getProfile = (t: string) => call<Profile>(t, "/v1/profile");
export const listProjects = (t: string) => call<Project[]>(t, "/v1/projects");
export const listOrgs = (t: string) => call<Org[]>(t, "/v1/organizations");
export const getProject = (t: string, ref: string) => call<Project>(t, `/v1/projects/${ref}`);
export const getDiskUtil = (t: string, ref: string) => call<DiskUtil>(t, `/v1/projects/${ref}/config/disk/util`);
export const listApiKeys = (t: string, ref: string) => call<ApiKey[]>(t, `/v1/projects/${ref}/api-keys?reveal=false`);

const SERVICES = ["auth", "db", "pooler", "realtime", "rest", "storage"] as const;
export const getHealth = (t: string, ref: string) =>
  call<ServiceHealth[]>(t, `/v1/projects/${ref}/health?services=${SERVICES.join(",")}&timeout_ms=4000`);

/** Read-only SQL. The endpoint rejects unqualified entity references, so schema-qualify everything. */
export const readOnlyQuery = <T = Record<string, unknown>>(t: string, ref: string, query: string) =>
  call<T[]>(t, `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
