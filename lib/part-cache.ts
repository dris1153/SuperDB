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
 * - `definition` holds Shiki-rendered HTML for a whole `CREATE TABLE`, by far the largest thing here,
 *   and it is read when someone opens one tab rather than on every page load. The browser's own
 *   60s `staleTime` already covers switching back and forth, so a server copy buys almost nothing
 *   and is the one entry that could make 500 of these a memory figure nobody predicted.
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

  // Live figures — database size, connection count, the table inventory.
  overview: 30_000,
  tables: 30_000,

  // Catalog. Short, and dropped outright by any write to this project.
  schemas: 30_000,
  "schema-tables": 30_000,
  columns: 30_000,
  policies: 30_000,

  rows: 0,
  logs: 0,
  // A page of users, which the same page bans, deletes and invites. A cached list would show the
  // state from before the click.
  "auth-users": 0,
  "auth-user": 0,
  // Written from the page that shows it, so a cached copy would show the state before the save.
  "auth-config": 0,
  "oauth-server": 0,
  // Read on opening the page and on a click; a cached copy would outlive the migration just run.
  "schema-graph": 0,
  "schema-definition": 0,
  "oauth-clients": 0,
  // Read once when the tab is opened. The logs endpoint throttles, so nothing polls it.
  "auth-user-logs": 0,
  // Carries real key values for the public key types. Sixty seconds of a credential sitting in this
  // process buys nothing on a page somebody opens to read one thing.
  "api-key-rows": 0,
  // A flag, not a credential — but it is toggled from this page and a stale copy would show the
  // switch in the position it was in before the click.
  "legacy-api-keys": 0,
  // Same reason, and it holds no credential at all: the JWT keys page is built around writes, so a
  // cached list would show the state from before the click.
  "signing-keys": 0,
  // Written from the storage settings tab, and the flags decide what three other pages offer.
  "storage-config": 0,
  // Created, edited and deleted from the page that lists them.
  buckets: 0,
  // The thing the reader is looking at, and the thing they are changing.
  objects: 0,
  // Written from the Policies tab.
  "storage-policies": 0,
  definition: 0,
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
 * entry rather than two, and **re-encoded** so that they are one entry only when they are one
 * question. `URLSearchParams` hands back decoded values, so joining them raw made
 * `?schema=public%26table=users` — a single param whose value contains an ampersand — produce the
 * same key as the two-param form. That is a collision an attacker can aim: a link to the victim's
 * own table editor whose schema does not exist reads as a successful empty result, which would then
 * be cached under the key their real request uses. Encoding makes the key injective.
 */
export function partKey(
  userId: string,
  ref: string,
  part: string,
  search: URLSearchParams | string,
): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const sorted = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = sorted
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${userId}:${ref}:${part}:${query}`;
}

/**
 * One store for the whole process, pinned to `globalThis`.
 *
 * **This is not a style choice and removing it breaks invalidation silently.** Next compiles a module
 * once per bundle layer, and these two halves live in different layers: `readPart` is reached from a
 * route handler, `recordWrite` from a server action. A module-level `const store = new Map()` gives
 * each layer its own — verified in the build output, where the route chunk held the table and the
 * writes while the action chunk held a `dropProject` iterating a map that was always empty. Every
 * write appeared to invalidate and none of them did: a table created in the editor stayed missing
 * from the sidebar for the full TTL, and no client-side refresh could fix it, because the server kept
 * answering with what it had.
 *
 * Pinning also survives HMR in development, where a module reload would otherwise orphan the map.
 */
type Entry = { value: unknown; at: number };
type Store = { entries: Map<string, Entry>; generations: Map<string, number> };

const globalStore = globalThis as typeof globalThis & { __superdbPartCache?: Store };
const store: Store = (globalStore.__superdbPartCache ??= {
  entries: new Map(),
  generations: new Map(),
});

/** A bound, and a smaller one per user so that one person cannot flush everybody else's. */
const MAX_ENTRIES = 500;
const MAX_PER_USER = 100;

/**
 * What the caller must capture *before* it starts reading, and hand back when it stores the answer.
 *
 * An upstream read takes 800–1200ms. If a write commits in the middle of one, `dropProject` clears a
 * cache the in-flight read is about to repopulate with what it fetched before the change — and the
 * next reader gets that for a full TTL. The counter moves on every drop, so a write that started in
 * an older generation is refused rather than stored.
 */
export function generationOf(ref: string): number {
  return store.generations.get(ref) ?? 0;
}

/**
 * `{ value }` rather than the value itself: a reader may legitimately answer `null` — a relation that
 * is gone — and returning the bare value would make that indistinguishable from a miss, so the
 * slowest call on the page would be the one never cached.
 */
export function readCached<T>(key: string, ttlMs: number): { value: T } | undefined {
  if (ttlMs <= 0) return undefined;

  const entry = store.entries.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at >= ttlMs) {
    store.entries.delete(key);
    return undefined;
  }
  return { value: entry.value as T };
}

export function writeCached(
  key: string,
  value: unknown,
  ttlMs: number,
  ref: string,
  seenGeneration: number,
): void {
  if (ttlMs <= 0) return;
  // The read started before a write landed. What it holds is the state from before that write.
  if (generationOf(ref) !== seenGeneration) return;

  // Deleted first so the re-insert moves it to the end, which is what makes the eviction below
  // least-recently-written rather than oldest-ever.
  store.entries.delete(key);
  store.entries.set(key, { value, at: Date.now() });

  evictOldest(keysOfUser(key.slice(0, key.indexOf(":") + 1)), MAX_PER_USER);
  evictOldest([...store.entries.keys()], MAX_ENTRIES);
}

/**
 * Per-user first, then overall. Without the per-user bound the cap is a shared resource: anyone
 * signed in can mint unlimited keys by varying a param, and 500 of those evict every other person's
 * entries — including their `metrics` entry, which is the one this cache exists to protect.
 */
function keysOfUser(prefix: string): string[] {
  return [...store.entries.keys()].filter((key) => key.startsWith(prefix));
}

function evictOldest(keys: string[], limit: number): void {
  for (let i = 0; i < keys.length - limit; i += 1) store.entries.delete(keys[i]);
}

/**
 * Everything remembered about one project, for every user, dropped — and the generation moved, so
 * that reads already in flight cannot put it back.
 *
 * Called after a write commits. The browser invalidates its own queries at that moment and refetches
 * immediately — so a cache that survived the write would answer that refetch with the state from
 * before it, and the grid would show the row that was just deleted. Every user's entry goes, not just
 * the writer's: two people on one project see one database.
 */
export function dropProject(ref: string): void {
  store.generations.set(ref, generationOf(ref) + 1);

  for (const key of store.entries.keys()) {
    // Positional, not a substring search: the ref sits between the first and second colon, and a
    // `includes` would also match a ref that turned up inside a param value.
    if (key.split(":", 2)[1] === ref) store.entries.delete(key);
  }
}

/**
 * Everything this user has cached, for every project, dropped.
 *
 * Called when a connection is removed. The cache is keyed by project rather than by connection, so
 * there is no way to drop only what that token fetched — and leaving it would mean a disconnect that
 * does not take effect for up to five minutes, which is not what the word means.
 */
export function dropUser(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of store.entries.keys()) {
    if (key.startsWith(prefix)) store.entries.delete(key);
  }
}

/** Test seam. Nothing in the app calls this. */
export function clearPartCache(): void {
  store.entries.clear();
  store.generations.clear();
}

/** Test seam: how many entries are held. */
export function cachedCount(): number {
  return store.entries.size;
}
