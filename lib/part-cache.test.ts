import assert from "node:assert/strict";
import test from "node:test";
import {
  cachedCount,
  clearPartCache,
  dropProject,
  generationOf,
  partKey,
  PART_TTL_MS,
  readCached,
  writeCached,
} from "./part-cache.ts";
import { PART_NAMES } from "./project-part-names.ts";

const REF = "abcdefghijklmnopqrst";
const KEY = partKey("user-1", REF, "overview", "");

test("every part except identity has a TTL decision", () => {
  // The map is `Record<Exclude<Part, "identity">, number>`, so this is the compiler's job — but the
  // compiler cannot say whether a *new* part was given a deliberate zero or an absent-minded one.
  for (const part of PART_NAMES) {
    if (part === "identity") continue;
    assert.equal(typeof PART_TTL_MS[part], "number", `${part} has no TTL`);
  }
});

test("the parts that must never be cached are not cached", () => {
  // Rows change under the reader; a log window is the question, not the answer; saved queries are
  // written into the browser's cache by their own mutations; a definition is the largest value here
  // and is read when one tab is opened rather than on every load.
  for (const part of ["rows", "logs", "saved-queries", "definition"] as const) {
    assert.equal(PART_TTL_MS[part], 0, `${part} must not be cached`);
  }
});

test("metrics is capped at the rate limit's window", () => {
  // Measured: x-ratelimit-limit is 10 per 60s on that endpoint alone. A longer TTL is fine for speed
  // but this is the number that keeps the page off 429.
  assert.ok(PART_TTL_MS.metrics <= 60_000);
});

test("a hit inside the window returns the stored value", () => {
  clearPartCache();
  writeCached(KEY, { db_bytes: 1 }, 60_000, REF, generationOf(REF));
  assert.deepEqual(readCached(KEY, 60_000), { value: { db_bytes: 1 } });
});

test("null is a value, not a miss", () => {
  // `definition` answers null for a relation that is gone. Returning the bare value would make that
  // read as a miss for ever, so the slowest call on the page would be the one never cached.
  clearPartCache();
  writeCached(KEY, null, 60_000, REF, generationOf(REF));
  assert.deepEqual(readCached(KEY, 60_000), { value: null });
});

test("a zero TTL neither stores nor returns", () => {
  clearPartCache();
  writeCached(KEY, "x", 0, REF, generationOf(REF));
  assert.equal(cachedCount(), 0);
  assert.equal(readCached(KEY, 0), undefined);
});

test("an expired entry is a miss and is dropped", async () => {
  clearPartCache();
  writeCached(KEY, "old", 60_000, REF, generationOf(REF));
  // Real time rather than a faked clock: the entry is read back against a 1ms TTL after 5ms have
  // actually passed, which is the same arithmetic the app does.
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(readCached(KEY, 1), undefined);
  assert.equal(cachedCount(), 0, "an expired entry is not left behind");
});

test("two users never share an entry", () => {
  clearPartCache();
  const mine = partKey("user-1", "abcdefghijklmnopqrst", "overview", "");
  const theirs = partKey("user-2", "abcdefghijklmnopqrst", "overview", "");
  assert.notEqual(mine, theirs);

  writeCached(mine, "mine", 60_000, REF, generationOf(REF));
  assert.equal(readCached(theirs, 60_000), undefined);
});

test("params are sorted, so one question is one entry", () => {
  const a = partKey("u", "abcdefghijklmnopqrst", "columns", "schema=public&table=users");
  const b = partKey("u", "abcdefghijklmnopqrst", "columns", "table=users&schema=public");
  assert.equal(a, b);

  const other = partKey("u", "abcdefghijklmnopqrst", "columns", "schema=public&table=orders");
  assert.notEqual(a, other);
});

test("a URLSearchParams and its string form key the same", () => {
  const search = new URLSearchParams({ table: "users", schema: "public" });
  assert.equal(
    partKey("u", "abcdefghijklmnopqrst", "columns", search),
    partKey("u", "abcdefghijklmnopqrst", "columns", "schema=public&table=users"),
  );
});

test("a write to a project drops every user's copy of it", () => {
  clearPartCache();
  const ref = "abcdefghijklmnopqrst";
  writeCached(partKey("user-1", ref, "columns", "schema=public"), "a", 60_000, REF, generationOf(REF));
  writeCached(partKey("user-2", ref, "tables", ""), "b", 60_000, REF, generationOf(REF));
  writeCached(partKey("user-1", "zzzzzzzzzzzzzzzzzzzz", "tables", ""), "elsewhere", 60_000, REF, generationOf(REF));

  dropProject(ref);

  assert.equal(cachedCount(), 1, "only the other project's entry survives");
  assert.deepEqual(
    readCached(partKey("user-1", "zzzzzzzzzzzzzzzzzzzz", "tables", ""), 60_000),
    { value: "elsewhere" },
  );
});

test("the store is bounded, and evicts what was written longest ago", () => {
  clearPartCache();
  for (let i = 0; i < 520; i += 1) {
    writeCached(partKey("u", "abcdefghijklmnopqrst", "columns", `table=t${i}`), i, 60_000, REF, generationOf(REF));
  }
  assert.ok(cachedCount() <= 500, `held ${cachedCount()}`);
  assert.equal(readCached(partKey("u", "abcdefghijklmnopqrst", "columns", "table=t0"), 60_000), undefined);
  assert.deepEqual(
    readCached(partKey("u", "abcdefghijklmnopqrst", "columns", "table=t519"), 60_000),
    { value: 519 },
  );
});

test("re-writing a key keeps it from being evicted as old", () => {
  // Counts sit under the per-user bound on purpose: this is about eviction *order*, and a run that
  // tripped the bound would pass for the wrong reason.
  clearPartCache();
  const kept = partKey("u", REF, "tables", "");
  writeCached(kept, "first", 60_000, REF, generationOf(REF));
  for (let i = 0; i < 60; i += 1) {
    writeCached(partKey("u", REF, "columns", `table=t${i}`), i, 60_000, REF, generationOf(REF));
  }
  writeCached(kept, "refreshed", 60_000, REF, generationOf(REF));
  for (let i = 60; i < 110; i += 1) {
    writeCached(partKey("u", REF, "columns", `table=t${i}`), i, 60_000, REF, generationOf(REF));
  }
  assert.deepEqual(readCached(kept, 60_000), { value: "refreshed" });
  assert.equal(readCached(partKey("u", REF, "columns", "table=t0"), 60_000), undefined);
});

test("a read that started before a write is not stored after it", () => {
  // The failure this prevents: an 800-1200ms read is in flight when someone commits an `alter table`.
  // The drop clears the cache, then the in-flight read lands holding the column list from before the
  // change — and stores it, for a full TTL, right where the post-write refetch will look.
  clearPartCache();
  const key = partKey("user-1", REF, "columns", "schema=public");
  const seen = generationOf(REF);

  dropProject(REF);
  writeCached(key, ["old", "columns"], 60_000, REF, seen);

  assert.equal(cachedCount(), 0, "the stale answer was refused");
  assert.equal(readCached(key, 60_000), undefined);

  // And the next read, which started after the drop, stores normally.
  writeCached(key, ["new", "columns"], 60_000, REF, generationOf(REF));
  assert.deepEqual(readCached(key, 60_000), { value: ["new", "columns"] });
});

test("a param value cannot impersonate another param", () => {
  // `URLSearchParams` decodes on the way out, so joining raw made a single param whose value contains
  // an ampersand key the same as two params. Reachable by sending someone a link to their own table
  // editor: an unknown schema is a *successful* empty answer, which would then sit in the cache under
  // the key their real request uses.
  const collided = partKey("u", REF, "columns", "schema=public%26table=users");
  const honest = partKey("u", REF, "columns", "schema=public&table=users");
  assert.notEqual(collided, honest);
});

test("a ref inside a param value does not drop that project", () => {
  clearPartCache();
  const other = "zzzzzzzzzzzzzzzzzzzz";
  // A key for project `other` whose param value happens to contain the ref being dropped.
  const key = partKey("u", other, "columns", `table=${REF}`);
  writeCached(key, "kept", 60_000, other, generationOf(other));

  dropProject(REF);
  assert.deepEqual(readCached(key, 60_000), { value: "kept" }, "only the named project is dropped");
});

test("one user cannot flush another user's entries", () => {
  clearPartCache();
  const mine = partKey("victim", REF, "metrics", "");
  writeCached(mine, "memory", 60_000, REF, generationOf(REF));

  // The noisy neighbour mints far more keys than the per-user bound allows.
  for (let i = 0; i < 400; i += 1) {
    const key = partKey("noisy", REF, "schema-tables", `schema=s${i}`);
    writeCached(key, i, 60_000, REF, generationOf(REF));
  }

  assert.deepEqual(readCached(mine, 60_000), { value: "memory" }, "the quota-protecting entry survived");
});

test("a user is bounded to their own share", () => {
  clearPartCache();
  for (let i = 0; i < 300; i += 1) {
    writeCached(partKey("u", REF, "schema-tables", `schema=s${i}`), i, 60_000, REF, generationOf(REF));
  }
  assert.ok(cachedCount() <= 100, `one user held ${cachedCount()}`);
});
