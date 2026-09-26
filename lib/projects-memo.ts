import type { Org, Project } from "./mgmt-api";

/**
 * One connection's project list, remembered for a few seconds.
 *
 * Every navigation calls `listProjects` and `listOrgs` once per connection. They are the two
 * slowest-changing reads in the app and the two most often repeated — a user with three connections
 * pays six Management API calls to draw a board that changed by nothing.
 *
 * **This is tenant data, and that decides the design.** An entry holds one Supabase account's
 * projects. Serving one to the wrong caller is the failure this module is built around, not a
 * performance regression.
 *
 * - **Keyed on the connection id, never on the token.** A token rotates on OAuth refresh; the same
 *   account's projects are the same projects, so a refresh should not throw the entry away. A token
 *   must also never reach a cache key or a log line.
 * - **The token is an argument.** Nothing here reads cookies or resolves a user — the caller has
 *   already done that, through RLS, and passes in what it proved.
 * - **In process, not in Next's data cache.** `unstable_cache` was the plan's recommendation, and
 *   its own documentation says it "persists the result across requests **and deployments**". A
 *   durable, deployment-wide store holding one tenant's project list is a larger blast radius than
 *   this is worth. A memo dies with the instance and holds at most a hundred entries.
 *
 * `lib/part-cache.ts` and the owner memo in `lib/inventory.ts` are the same pattern, including the
 * `globalThis` pinning — Next compiles a module once per bundle layer, so a plain module-level Map
 * would give the route layer and the RSC layer one each and quietly never hit.
 *
 * Not `server-only`, and not by oversight: `part-cache.ts` is not either. Nothing here performs
 * I/O — the loader is the caller's — and being importable is what lets the isolation between two
 * connections be a test rather than a promise.
 */
export type ConnectionProjects = { projects: Project[]; orgs: Org[] };

/**
 * Short enough that a project created in the Supabase dashboard shows up on the next glance rather
 * than the next minute. The board is the one page people watch while making one.
 */
export const PROJECTS_TTL_MS = 20_000;

const MAX_ENTRIES = 100;

type Entry = { at: number; value: ConnectionProjects };

const pinned = globalThis as typeof globalThis & { __superdbProjects?: Map<string, Entry> };
const store = (pinned.__superdbProjects ??= new Map<string, Entry>());

const fresh = (entry: Entry, now: number) => now - entry.at < PROJECTS_TTL_MS;

/**
 * The connection's projects, from memory when they are recent enough.
 *
 * `load` is passed in rather than imported so this module never calls the Management API itself:
 * `lib/mgmt-api.ts` stays a thin uncached transport, which is what makes both of them easy to
 * reason about — and it is what lets this be tested without a network.
 *
 * A failed load is not remembered. A connection whose token has expired should retry on the next
 * navigation rather than be told it has no projects for twenty seconds.
 */
export async function projectsForConnection(
  connectionId: string,
  load: () => Promise<ConnectionProjects>,
  now = Date.now(),
): Promise<ConnectionProjects> {
  const hit = store.get(connectionId);
  if (hit && fresh(hit, now)) return hit.value;

  // Dropped before the load, not after it succeeds: a load that throws would otherwise leave the
  // expired entry in memory until something unrelated evicted it.
  if (hit) store.delete(connectionId);

  const value = await load();

  // The oldest entry, not the whole map — `part-cache.ts` learned this: one person with many
  // connections must not flush everyone else's and send them all back to a throttled API.
  if (store.size >= MAX_ENTRIES) {
    const oldest = [...store.entries()].reduce((a, b) => (a[1].at <= b[1].at ? a : b));
    store.delete(oldest[0]);
  }

  store.set(connectionId, { at: now, value });
  return value;
}

/**
 * Dropped when the connection itself changes — added, edited, removed, or its token replaced.
 *
 * Without this, disconnecting an account leaves its projects on the board for the rest of the TTL,
 * which reads as a failed disconnect.
 */
export const forgetConnectionProjects = (connectionId: string) => {
  store.delete(connectionId);
};

/** For the tests, which must not inherit entries from each other. */
export const forgetAllProjects = () => {
  store.clear();
};
