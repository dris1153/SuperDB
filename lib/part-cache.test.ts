import assert from "node:assert/strict";
import test from "node:test";
import {
  cachedCount,
  clearPartCache,
  dropProject,
  partKey,
  PART_TTL_MS,
  readCached,
  writeCached,
} from "./part-cache.ts";
import { PART_NAMES } from "./project-part-names.ts";

const KEY = partKey("user-1", "abcdefghijklmnopqrst", "overview", "");

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
  // written into the browser's cache by their own mutations.
  for (const part of ["rows", "logs", "saved-queries"] as const) {
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
  writeCached(KEY, { db_bytes: 1 }, 60_000);
  assert.deepEqual(readCached(KEY, 60_000), { value: { db_bytes: 1 } });
});

test("null is a value, not a miss", () => {
  // `definition` answers null for a relation that is gone. Returning the bare value would make that
  // read as a miss for ever, so the slowest call on the page would be the one never cached.
  clearPartCache();
  writeCached(KEY, null, 60_000);
  assert.deepEqual(readCached(KEY, 60_000), { value: null });
});

test("a zero TTL neither stores nor returns", () => {
  clearPartCache();
  writeCached(KEY, "x", 0);
  assert.equal(cachedCount(), 0);
  assert.equal(readCached(KEY, 0), undefined);
});

test("an expired entry is a miss and is dropped", async () => {
  clearPartCache();
  writeCached(KEY, "old", 60_000);
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

  writeCached(mine, "mine", 60_000);
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
  writeCached(partKey("user-1", ref, "columns", "schema=public"), "a", 60_000);
  writeCached(partKey("user-2", ref, "tables", ""), "b", 60_000);
  writeCached(partKey("user-1", "zzzzzzzzzzzzzzzzzzzz", "tables", ""), "elsewhere", 60_000);

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
    writeCached(partKey("u", "abcdefghijklmnopqrst", "columns", `table=t${i}`), i, 60_000);
  }
  assert.ok(cachedCount() <= 500, `held ${cachedCount()}`);
  assert.equal(readCached(partKey("u", "abcdefghijklmnopqrst", "columns", "table=t0"), 60_000), undefined);
  assert.deepEqual(
    readCached(partKey("u", "abcdefghijklmnopqrst", "columns", "table=t519"), 60_000),
    { value: 519 },
  );
});

test("re-writing a key keeps it from being evicted as old", () => {
  clearPartCache();
  const kept = partKey("u", "abcdefghijklmnopqrst", "tables", "");
  writeCached(kept, "first", 60_000);
  for (let i = 0; i < 400; i += 1) {
    writeCached(partKey("u", "abcdefghijklmnopqrst", "columns", `table=t${i}`), i, 60_000);
  }
  writeCached(kept, "refreshed", 60_000);
  for (let i = 400; i < 600; i += 1) {
    writeCached(partKey("u", "abcdefghijklmnopqrst", "columns", `table=t${i}`), i, 60_000);
  }
  assert.deepEqual(readCached(kept, 60_000), { value: "refreshed" });
});
