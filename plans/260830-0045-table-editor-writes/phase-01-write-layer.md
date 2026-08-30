---
phase: 1
title: "Write layer"
status: pending
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase B1: Write layer

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

- [ ] `pnpm typecheck` clean; `sql-write` tests pass alongside the existing suite
- [ ] An `UPDATE` or `DELETE` with no key throws at build time — asserted, not assumed
- [ ] A hostile payload written to a live throwaway table is stored as data and the table survives
- [ ] `execute` reports the true affected count, verified against a multi-row update
- [ ] A write appears in `connection_events` with schema, table, operation and count
- [ ] Nothing in this phase is reachable from the UI

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A predicate is dropped and an `UPDATE` hits every row | Builders throw on an empty key; tested first |
| The tag appears in the payload | Generate, then verify, then regenerate — the check is the safety property |
| The write role is `postgres` and bypasses RLS | Nothing here can be triggered from the UI yet; B2 adds the confirmation |
| Audit silently drops entries | Keep `recordEvent` non-throwing, but document that the trail is best-effort |
| Type coercion differs from what the grid displayed | `as x(...)` uses the catalog's own `data_type`, not a guess |
