import type { Part } from "./project-part-names";

/**
 * How long a part's answer may be reused, per (user, project, part, params).
 *
 * The numbers are not taste. Measured 2026-09-15 against a live project, `x-ratelimit-limit` says the
 * metrics endpoint allows **10 requests per 60 seconds** and everything else 120 — so eleven loads of
 * the overview in a minute, one person clicking between two projects, used to return 429. Caching
 * metrics is what keeps that page working; the rest is speed.
 *
 * Zero means never cache, and the zeros are the interesting entries:
 *
 * - `rows` changes under the reader and is the thing they are looking at.
 * - `logs` is a time window; reusing one shows an older window than the one asked for.
 * - `saved-queries` is written straight into the browser's cache by its own mutations, so a server
 *   copy could only ever be the older of the two.
 *
 * The catalog parts get a short life *and* are dropped on every write to the project — a stale column
 * list after `alter table` is worse than no cache at all, because the browser invalidates and refetches
 * precisely then, and would be handed the version from before the change.
 */
export const PART_TTL_MS: Record<Exclude<Part, "identity">, number> = {
  // Quota, not speed: one slot of ten per minute, per user, per project.
  metrics: 60_000,

  // Nearly immobile, and `migrations` is the slowest endpoint measured — 794–1026ms to answer `[]`.
  migrations: 300_000,
  addons: 300_000,
  branches: 300_000,
  backups: 300_000,

  // State rather than history: rarely different, but not something to show five minutes late.
  disk: 60_000,
  pooler: 60_000,
  health: 60_000,
  "api-keys": 60_000,

  // Live figures — database size, connection count, the table inventory.
  overview: 30_000,
  tables: 30_000,

  // Catalog. Short, and dropped outright by any write to this project.
  schemas: 30_000,
  "schema-tables": 30_000,
  columns: 30_000,
  policies: 30_000,
  definition: 30_000,

  rows: 0,
  logs: 0,
  "saved-queries": 0,
};

/**
 * The key, and the reason it starts with the user.
 *
 * Everything in this cache was fetched with one person's OAuth token and is theirs. A key that
 * omitted the user id would hand project data to whoever asked next, which is the one failure this
 * module must not have. The caller does not supply the id — `readPart` takes it from `requireUser()`.
 *
 * Params are sorted so that `?schema=public&table=users` and `?table=users&schema=public` are one
 * entry rather than two. An unknown extra param makes a different key, which costs a miss and never
 * an incorrect hit.
 */
export function partKey(
  userId: string,
  ref: string,
  part: string,
  search: URLSearchParams | string,
): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const sorted = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = sorted.map(([k, v]) => `${k}=${v}`).join("&");
  return `${userId}:${ref}:${part}:${query}`;
}

/**
 * A bound, because without one every project anyone has ever opened stays in memory for the life of
 * the process. Entries are re-inserted on write, so the oldest key is the least recently written.
 */
const MAX_ENTRIES = 500;

const store = new Map<string, { value: unknown; at: number }>();

/**
 * `{ value }` rather than the value itself: a reader may legitimately answer `null` — `definition`
 * does, for a relation that is gone — and returning the bare value would make that indistinguishable
 * from a miss, so the slowest call on the page would be the one never cached.
 */
export function readCached<T>(key: string, ttlMs: number): { value: T } | undefined {
  if (ttlMs <= 0) return undefined;

  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at >= ttlMs) {
    store.delete(key);
    return undefined;
  }
  return { value: entry.value as T };
}

export function writeCached(key: string, value: unknown, ttlMs: number): void {
  if (ttlMs <= 0) return;

  // Deleted first so the re-insert moves it to the end, which is what makes the eviction below
  // least-recently-written rather than oldest-ever.
  store.delete(key);
  store.set(key, { value, at: Date.now() });

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/**
 * Everything remembered about one project, for every user, dropped.
 *
 * Called after a write commits. The browser invalidates its own queries at that moment and refetches
 * immediately — so a cache that survived the write would answer that refetch with the state from
 * before it, and the grid would show the row that was just deleted. Every user's entry goes, not just
 * the writer's: two people on one project see one database.
 */
export function dropProject(ref: string): void {
  for (const key of store.keys()) {
    if (key.includes(`:${ref}:`)) store.delete(key);
  }
}

/** Test seam. Nothing in the app calls this. */
export function clearPartCache(): void {
  store.clear();
}

/** Test seam: how many entries are held. */
export function cachedCount(): number {
  return store.size;
}
