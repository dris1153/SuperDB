import { MgmtError } from "./mgmt-api";

/** Runs a Management API call that is allowed to fail (paused projects, missing scopes). */
export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export type Attempt<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; reason: string };

/**
 * Like safe(), but keeps why the call failed.
 *
 * Supabase refuses OAuth tokens in two different ways, and they mean opposite things:
 *
 *   403 "missing required scopes (…)"      the grant is too narrow — re-authorizing fixes it
 *   401 "does not support oauth access yet" the endpoint has no OAuth support at all — no scope helps
 *
 * Encoding a guess about which endpoints fall where would freeze today's snapshot of Supabase into
 * branch conditions. Attempting the call and reading the answer keeps the app correct as they ship.
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof MgmtError) {
      return { ok: false, status: e.status, reason: describe(e) };
    }
    return { ok: false, status: null, reason: e instanceof Error ? e.message : "Request failed" };
  }
}

function describe(error: MgmtError): string {
  const message = error.message;

  if (/does not support oauth access yet/i.test(message)) {
    return "Supabase does not offer this over OAuth yet — no scope enables it. Connect with an access token instead.";
  }

  const scope = /missing required scopes \(([^)]+)\)/i.exec(message);
  if (scope) {
    return `The OAuth grant is missing the ${scope[1]} scope. Re-authorize the connection to add it.`;
  }

  if (error.status === 401) return "Not authorized for this project.";
  if (error.status === 403) return "Forbidden for this connection.";
  return "Unavailable right now.";
}
