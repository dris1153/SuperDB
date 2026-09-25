import "server-only";
import { projectKey } from "./project-key";
import type { AuthUser } from "./auth-users";
import { clientsFrom, type OAuthClient } from "./oauth-clients";

/**
 * The project's own GoTrue admin API.
 *
 * The Management API has no users at all — its whole auth surface is `config/auth` and the signing
 * keys. And GoTrue refuses the token this app authenticates with: measured 2026-09-25,
 * `/auth/v1/admin/users` answers a Management PAT with
 * `401 {"message":"No API key found in request"}`. So this needs `projectKey()`, the same
 * `service_role` credential Storage reads, under the same rule: `server-only`, never in a response.
 */
const origin = (ref: string) => `https://${ref}.supabase.co/auth/v1`;

/** GoTrue words its failures two ways — `message` and `msg` — and means the same thing by both. */
export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(
  ref: string,
  path: string,
  init: RequestInit = {},
): Promise<{ body: T; headers: Headers }> {
  const lookup = await projectKey(ref);
  if (!lookup.ok) throw new AuthError(403, lookup.reason);

  const res = await fetch(origin(ref) + path, {
    ...init,
    headers: {
      authorization: `Bearer ${lookup.key}`,
      apikey: lookup.key,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();

  if (!res.ok) {
    try {
      const body = JSON.parse(text) as { message?: string; msg?: string; error_code?: string };
      throw new AuthError(res.status, body.message ?? body.msg ?? text.slice(0, 300));
    } catch (e) {
      if (e instanceof AuthError) throw e;
      // A proxy answering with HTML says less in three hundred characters than the status does.
      throw new AuthError(res.status, `This project's auth service answered ${res.status}.`);
    }
  }

  return { body: (text ? JSON.parse(text) : undefined) as T, headers: res.headers };
}

export type UserPage = { users: AuthUser[]; total: number | null; hasNext: boolean };

/**
 * One page of users.
 *
 * **`filter`, never `email`.** Measured: `?filter=` is a substring match that narrows
 * `x-total-count` server-side, and `?email=` is accepted and ignored — which is worse than an
 * error, because the list comes back whole and looks like a search that found everything.
 *
 * The totals are in headers rather than the body: `x-total-count` is the count, and `link` carries
 * `rel="next"` only while there is a next page, which is what decides the paging control.
 *
 * `identities` is null on every user in a listing, so the details panel has to read the user again.
 */
/**
 * One user, which is not the same shape as one row of the listing.
 *
 * `identities` is null in a list and populated here, so the panel's Provider Information block
 * cannot be rendered from the row it was opened from. Measured.
 */
export const getUser = (ref: string, id: string) =>
  call<AuthUser>(ref, `/admin/users/${encodeURIComponent(id)}`).then((r) => r.body);

/** `[]` on a user with none, rather than a 404. Measured. */
export const listFactors = (ref: string, id: string) =>
  call<{ factors?: Factor[] } | Factor[]>(ref, `/admin/users/${encodeURIComponent(id)}/factors`).then(
    ({ body }) => (Array.isArray(body) ? body : (body?.factors ?? [])),
  );

export type Factor = {
  id: string;
  factor_type: string;
  friendly_name?: string | null;
  status: string;
  created_at: string;
};

export const createUser = (
  ref: string,
  body: { email: string; password?: string; email_confirm: boolean },
) => call<AuthUser>(ref, "/admin/users", { method: "POST", body: JSON.stringify(body) }).then((r) => r.body);

/** Ban and unban are the same call: `ban_duration` is a Go duration, or `"none"` to lift it. */
export const updateUser = (ref: string, id: string, body: Record<string, unknown>) =>
  call<AuthUser>(ref, `/admin/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }).then((r) => r.body);

export const deleteUser = (ref: string, id: string) =>
  call<unknown>(ref, `/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });

export const deleteFactor = (ref: string, id: string, factorId: string) =>
  call<unknown>(
    ref,
    `/admin/users/${encodeURIComponent(id)}/factors/${encodeURIComponent(factorId)}`,
    { method: "DELETE" },
  );

/**
 * Mints a link **and sends the mail**.
 *
 * Measured: the call came back with `recovery_sent_at` set on the user, so this is not a link
 * generator that leaves delivery to the caller. It spends one of `rate_limit_email_sent`, which is
 * 2 an hour on default SMTP — two clicks exhausts a project's allowance for the hour.
 */
export const generateLink = (ref: string, type: string, email: string) =>
  call<{ action_link?: string }>(ref, "/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type, email }),
  }).then((r) => r.body);

/**
 * The project's OAuth clients, and whether the server is even on.
 *
 * Measured: with `oauth_server_enabled` false this answers
 * `404 {"error_code":"feature_disabled"}` — the feature is gated, not missing. That is a state the
 * page shows a banner for, not an error, so it is returned rather than thrown.
 */
export async function listOAuthClients(
  ref: string,
): Promise<{ enabled: boolean; clients: OAuthClient[] }> {
  try {
    const { body } = await call<unknown>(ref, "/admin/oauth/clients");
    return { enabled: true, clients: clientsFrom(body) };
  } catch (e) {
    if (e instanceof AuthError && e.status === 404) return { enabled: false, clients: [] };
    throw e;
  }
}

/** 201, and the only response that ever carries `client_secret`. */
export const createOAuthClient = (
  ref: string,
  body: { client_name: string; client_type: string; redirect_uris: string[] },
) =>
  call<OAuthClient>(ref, "/admin/oauth/clients", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.body);

/** Answers 204, so there is no body to read. */
export const deleteOAuthClient = (ref: string, clientId: string) =>
  call<unknown>(ref, `/admin/oauth/clients/${encodeURIComponent(clientId)}`, { method: "DELETE" });

export async function listUsers(
  ref: string,
  options: { page: number; perPage: number; filter?: string },
): Promise<UserPage> {
  const query = new URLSearchParams({
    page: String(options.page),
    per_page: String(options.perPage),
  });
  if (options.filter) query.set("filter", options.filter);

  const { body, headers } = await call<{ users?: AuthUser[] }>(ref, `/admin/users?${query}`);

  const total = Number(headers.get("x-total-count"));

  return {
    // Not `body.users ?? []`: `call` casts over `JSON.parse`, so the declared type is a claim about
    // the body rather than a check on it.
    users: Array.isArray(body?.users) ? body.users : [],
    total: Number.isFinite(total) ? total : null,
    hasNext: (headers.get("link") ?? "").includes('rel="next"'),
  };
}
