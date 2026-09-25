import "server-only";
import { resolveProject } from "./inventory";
import { listApiKeys } from "./mgmt-api";
import { isFresh } from "./key-window";
import { attempt } from "./safe";

/**
 * A key that can talk to the project's own Storage API.
 *
 * **This is the first place the app uses a project credential rather than the account's.** Measured
 * 2026-09-25: `https://{ref}.supabase.co/storage/v1` answers a Management API token with
 * `Invalid Compact JWS`, and the Management API has no object endpoints at all, so there is no way
 * to build Storage without one.
 *
 * What it returns bypasses every row level security policy on `storage.objects`. So:
 *
 * - `server-only`, and never returned through a part reader or a server action's result.
 * - Read on demand, held for a minute, never written anywhere, and dropped the moment it is found
 *   stale rather than left in the heap until something else evicts it.
 * - `service_role` first, then a `secret` key for projects that have turned the legacy pair off.
 *   The fallback is unmeasured — no project to hand had legacy keys disabled.
 *
 * The cache is pinned to `globalThis` for the reason `lib/part-cache.ts` documents at length: a
 * module-level `Map` is compiled once per Next bundle layer, so the route layer and the RSC layer
 * would each get their own and the memo would never hit.
 */
type Cached = { key: string; at: number };

const globalStore = globalThis as typeof globalThis & { __superdbProjectKeys?: Map<string, Cached> };
const store = (globalStore.__superdbProjectKeys ??= new Map<string, Cached>());

const MAX_ENTRIES = 100;

export type KeyLookup =
  | { ok: true; key: string }
  | { ok: false; reason: string };

export async function projectKey(ref: string): Promise<KeyLookup> {
  const found = await resolveProject(ref);
  if (!found) return { ok: false, reason: "Project not found." };

  // Keyed by connection, not by project ref alone: two users may reach the same project through
  // different connections, and one must never be served the other's key.
  const id = `${found.connection.id}:${ref}`;
  const hit = store.get(id);
  if (hit && isFresh(hit.at)) return { ok: true, key: hit.key };

  // Dropped before the refetch, not after it succeeds: a refetch that fails would otherwise leave
  // the expired key sitting in memory until something unrelated evicted it.
  if (hit) store.delete(id);

  // `attempt` rather than a bare catch, so a missing OAuth scope says which scope and a rate limit
  // says it is temporary. Collapsing all of it into one sentence left a user whose grant cannot
  // read keys with no way to find out why Storage did not work.
  const read = await attempt(() => listApiKeys(found.token, ref, true));
  if (!read.ok) return { ok: false, reason: read.reason };

  const keys = read.data;
  const key =
    keys.find((k) => k.name === "service_role")?.api_key ??
    keys.find((k) => k.type === "secret")?.api_key;

  if (!key) {
    return {
      ok: false,
      reason:
        "This project has no service_role or secret key this connection can read. Storage needs one — the account token cannot reach a project's storage.",
    };
  }

  // The oldest entry, not everything: `part-cache.ts` learned this the hard way — one person with
  // many projects must not flush every other user's, sending them all back to an endpoint that
  // allows 120 requests a minute.
  if (store.size >= MAX_ENTRIES) {
    const oldest = [...store.entries()].reduce((a, b) => (a[1].at <= b[1].at ? a : b));
    store.delete(oldest[0]);
  }

  store.set(id, { key, at: Date.now() });

  return { ok: true, key };
}

/**
 * Dropped when a project's keys change, since the cached one may be the key that was just deleted.
 *
 * Called from `lib/api-key-actions.ts`, which is the only place in this app that can invalidate one.
 * Keyed by ref across every connection: whoever rotated it, the key is equally stale for all of
 * them.
 */
export const forgetProjectKey = (ref: string) => {
  for (const id of store.keys()) {
    if (id.endsWith(`:${ref}`)) store.delete(id);
  }
};
