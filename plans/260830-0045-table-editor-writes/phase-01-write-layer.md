---
phase: 1
title: "Write layer"
status: completed
priority: P1
effort: "1.5d"
dependencies: []
completed: 2026-08-30
---

# Phase B1: Write layer

## Deviations from this plan, as built

1. **`previewAffected` counts through the same join the write uses**, not a separately built
   predicate. The plan described it as "`select count(*) … where <the same predicate>`", which leaves
   room for the two to drift. `buildCount` emits the identical `jsonb_to_recordset` join with the
   identical keys, so the preview cannot describe something other than what is about to run. It still
   goes to the **read-only** endpoint, which cannot write even if it were wrong.
2. **`execute` refuses any statement without `RETURNING`.** The plan required the builders to emit it;
   this makes the runner check rather than trust. A write that slipped through without it would
   report zero rows affected and look like a no-op — the one failure this phase exists to prevent.
3. **`isGuardedSchema` added** so B2's second confirmation for `auth` and `storage` has one place to
   ask, rather than repeating the list per dialog.
4. **`buildUpdate` requires the key to be exactly the primary key**, not merely non-empty. A key of
   some other column would still emit a valid `UPDATE`, just one matching an unknown number of rows.

Verified: `pnpm typecheck` clean, `pnpm lint` clean, 162/162 tests (26 new).

**Verified live**, against a table created and dropped by the check:

- Two rows inserted with a payload of `x'; drop table public.bookmarks; --  $$ "q" \ ümlaut 🙂`;
  the stored value matched the payload **exactly**.
- Types coerced by Postgres from the JSON: `integer` → number, `boolean` → boolean, `jsonb` → object,
  and an explicit null stayed null rather than becoming the string "null".
- `previewAffected` reported 1, then 2, then 0 across an update and a two-row delete — matching what
  `RETURNING` counted each time.
- `execute` refused a statement with no `RETURNING`.
- Cleanup confirmed; `public.bookmarks` untouched throughout.

## Fixed after code review

The review found the escape layer sound — no path out of the literal or out of a quoted identifier —
and located the real weakness somewhere else: **four ways the layer reported something untrue about
what it had just done.** On a database with no undo, misreporting is as dangerous as miswriting.

1. **`buildInsert` wrote NULL over column DEFAULTs.** Taking the union of keys across rows put a
   column in the INSERT list for *every* row, and `jsonb_to_recordset` yields SQL NULL wherever a row
   omitted it. Measured on a live table: a row omitting `made_at timestamptz default now()` stored
   NULL. Silent data loss, reported as success. Rows must now all supply the same columns; a caller
   with ragged rows groups them. Splitting into several statements is not an alternative — a
   multi-statement request returns only the last result set, so `RETURNING` would under-count.
   **A test had entrenched the old behaviour as correct**; it now asserts the refusal.
2. **`buildUpdate` silently swallowed primary-key edits.** Key and patch share one JSON object and
   the key must win, or the `WHERE` would search for the row's new identity. An edit to a key column
   was therefore accepted, discarded, and reported as one row updated. Now refused, with a message
   saying to delete and re-insert.
3. **Values the grid truncated could be written back.** `table-rows.ts` cuts wide types at 512
   characters for display and `isTruncated` already existed to spot it — the write path never called
   it. `bytea` was the worst case: a cut `\x…` string is still valid input, so it would have stored
   something well-formed and wrong. Now refused in both insert and update.
4. **`execute` reported `affected: 0` for a response it did not understand.** `call()` returns
   `undefined` for an empty body, and `Array.isArray(undefined)` is false — so a committed write
   could be reported as having done nothing. It now throws: "no idea what happened" should not be
   dressed up as a number.

Also fixed:

- **The RETURNING guard was a regex over the SQL text** — which embeds the JSON payload, so a row
  value containing "returning " would have satisfied it. A guard whose verdict depends on user data
  is not a guard. Builders now return `{ sql, returning }` and `execute` accepts only that.
- **`buildCount` deduplicates keys.** Duplicates inflated `count(*)` over the join, so the preview
  could promise more rows than the delete would touch.
- **One contract for "a key".** `buildUpdate` demanded exactly the primary key while `buildDelete`
  and `buildCount` silently discarded anything extra. All three now go through `keyRows`, which also
  rejects an explicitly `undefined` key part — `n in k` is true for those, and `JSON.stringify` drops
  them, so the predicate would have compared against NULL and matched nothing.
- **`describeTable` now runs with `set local search_path = ''`.** `format_type` omits the schema for
  a type in the *calling* session's search_path; that result was being fed to a different session,
  under a different role, which could resolve a bare name to a different type of the same name. An
  empty search_path makes it always qualify. Verified the query still works.
- **The audit records failures too**, and carries the keys involved. A request can time out at the
  HTTP layer after the server has committed; without a record nothing would know it was attempted.
- **`countAffected` surfaces the real reason.** It stands immediately before a destructive step, so
  "this table has no primary key" and "the API call failed" must not collapse into one sentence.

Re-verified live after the fixes: a column omitted by *all* rows now takes its DEFAULT
(`made_at is null` false for every row), ragged rows are refused before any SQL runs, and a
primary-key edit is refused. 169/169 tests.

## Overview

The SQL construction, affected-row accounting and audit trail that every later phase sits on. Ships no
user-visible feature and is the most important phase in this plan: everything after it is UI over a
layer that is either safe or is not.

## Requirements

**Functional**
- Build `INSERT`, `UPDATE` and `DELETE` where every user value travels as JSON and never as SQL text.
- Report how many rows an operation *will* touch before it runs, and how many it *did* touch after.
- Record every write in `connection_events`.
- Refuse to build a statement that would affect rows without a predicate.

**Non-functional**
- One escape boundary per statement, not one per value.
- The layer is testable without a database: statement building is pure, execution is a thin wrapper.
- Nothing in this phase is reachable from the UI yet.

## Architecture

```
lib/sql-write.ts        pure: encode values, generate tag, build INSERT/UPDATE/DELETE text
lib/table-writes.ts     server-only: preview (read-only count) → execute (RETURNING) → audit
lib/write-actions.ts    "use server": the actions B2 will call
```

### The construction

Values go into **one** JSON literal, dollar-quoted with a random tag, and Postgres unpacks them:

```sql
insert into "public"."t" (id, name)
select id, name
from jsonb_to_recordset($sdbk3n8x2$[{"id":1,"name":"…"}]$sdbk3n8x2$::jsonb)
  as x(id int4, name text)
returning id;
```

Why this shape rather than quoting each value: `JSON.stringify` is a well-tested encoder, and the
result crosses into SQL at exactly **one** boundary whose safety is a single checkable property — that
the tag does not occur in the encoded string. N separately-quoted literals means N chances to be wrong.

The `as x(...)` column list comes from `ColumnInfo.data_type`, which is already fetched for the grid.

### Tag generation

Random suffix, then **verify** it does not occur in the encoded JSON, regenerating if it does. The
check is the safety property; the randomness only makes the first attempt succeed. A tag that is
generated but never checked is a bug that will not show up in testing.

## Related Code Files

**Create**
- `lib/sql-write.ts`, `lib/sql-write.test.ts`
- `lib/table-writes.ts`
- `lib/write-actions.ts`

**Modify**
- `lib/audit.ts` — extend `ConnectionEvent` with the write events
- `supabase/schema.sql` — widen the `connection_events.event` check constraint

## Implementation Steps

### 1. `lib/sql-write.ts` — tests first

```ts
export function jsonLiteral(value: unknown): { sql: string; tag: string }
export function buildInsert(schema, table, columns: ColumnInfo[], rows: RowRecord[]): string
export function buildUpdate(schema, table, columns, key: RowRecord, patch: RowRecord): string
export function buildDelete(schema, table, columns, keys: RowRecord[]): string
```

Tests to write before the implementation:

- a value containing `'`, `"`, `\`, a newline, `$$` and an emoji round-trips as data
- a value containing the tag that *would* have been chosen forces a different tag
- the emitted tag never appears inside the encoded JSON
- `buildUpdate` with an empty key throws rather than emitting an unpredicated `UPDATE`
- `buildDelete` with an empty key list throws
- every statement ends with `returning` on the primary key columns
- identifiers are quoted — a column named `order`, a table named `MyTable`
- the `as x(...)` list uses each column's real type, not `text`

The empty-key cases are the ones that matter most: an `UPDATE` or `DELETE` whose `WHERE` silently
disappears is how a table gets wiped.

### 2. `lib/table-writes.ts`

```ts
previewAffected(token, ref, schema, table, predicate): Promise<number>
execute(token, ref, sql): Promise<{ affected: number }>
```

- `previewAffected` runs `select count(*)::int … where <predicate>` on the **read-only** endpoint. It
  cannot write even if the predicate is wrong, which is the point of using that endpoint.
- `execute` posts to the write endpoint and counts the rows `RETURNING` gave back. The endpoint reports
  nothing otherwise — measured.

### 3. Audit

`connection_events.event` currently allows `connected | refreshed | refresh_failed | disconnected`.
Add `wrote`. `detail` carries schema, table, operation and affected count, truncated to the existing
500 characters.

`schema.sql` is idempotent and doubles as the migration path, so this is a
`drop constraint if exists` / `add constraint` pair in the convergence style already used there.

Keep `recordEvent`'s guarantee that it never throws: a lost log line is bad, a write that fails
*because* logging failed is worse. But note the consequence honestly in the code — an audit that can
silently drop entries is not an audit anyone should treat as complete.

### 4. `lib/write-actions.ts`

`"use server"`. Authorisation through `resolveProject`, like every other project-scoped action. Each
action validates schema, table and column names against the catalog **before** building anything —
quoting keeps a hostile name inert, catalog validation keeps an unknown one from being asked about.

Actions return a discriminated result (`{ ok, affected } | { ok: false, reason }`), matching the
`{ blocked, reason }` shape the connect panels already use.

### 5. Live verification

A scratch script, not a committed test: create a throwaway table, insert a hostile payload, update it,
delete it, drop the table. Same shape as the probe already run, kept out of the repo.

## Success Criteria

- [x] `pnpm typecheck` clean, `pnpm lint` clean; 162/162 tests (26 new)
- [x] An `UPDATE` or `DELETE` with no key throws at build time — asserted, not assumed
- [x] A hostile payload written to a live throwaway table is stored as data; the table and its neighbours survived
- [x] `execute` reports the true affected count — verified against a two-row delete
- [ ] A write appears in `connection_events` — needs a signed-in session to exercise
- [x] Nothing in this phase is reachable from the UI

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A predicate is dropped and an `UPDATE` hits every row | Builders throw on an empty key; tested first |
| The tag appears in the payload | Generate, then verify, then regenerate — the check is the safety property |
| The write role is `postgres` and bypasses RLS | Nothing here can be triggered from the UI yet; B2 adds the confirmation |
| Audit silently drops entries | Keep `recordEvent` non-throwing, but document that the trail is best-effort |
| Type coercion differs from what the grid displayed | `as x(...)` uses the catalog's own `data_type`, not a guess |
