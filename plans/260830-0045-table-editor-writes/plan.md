---
title: "Table Editor writes (group B)"
status: pending
created: 2026-08-30
blockedBy: []
blocks: []
---

# Table Editor writes

Turns the read-only browser into an editor: row inserts, edits and deletes, plus basic schema
changes. This is the difference between what was built and what Supabase's Table Editor actually is.

Design, probe findings and the safety model:
[table-editor-completion-brainstorm.md](../reports/260830-0045-table-editor-completion-brainstorm.md).

## Phases

| # | Phase | Status | Delivers |
|---|---|---|---|
| B1 | [Write layer](phase-01-write-layer.md) | pending | Safe SQL construction, affected counts, audit — no UI |
| B2 | [Row editing](phase-02-row-editing.md) | pending | Insert, inline edit, delete, behind preview + confirm |
| B3 | [Schema changes](phase-03-schema-changes.md) | pending | New table, add/alter/drop column, RLS toggle |
| B4 | [CSV import](phase-04-csv-import.md) | pending | Bulk insert from a file |

B1 ships no user-visible feature and is still the most important phase. Everything after it is UI
over a layer that is either safe or is not.

## Settled constraints

Measured 2026-08-30 against a live project, not assumed. Not open for re-litigation:

- **The write endpoint runs as `postgres`** — not `supabase_read_only_user`. Full DDL rights, bypasses
  RLS, can write any schema including `auth` and `storage`.
- **`POST /v1/projects/{ref}/database/query` accepts writes**: `CREATE TABLE`, `INSERT`, `UPDATE`,
  `DELETE`, `ALTER TABLE ADD/DROP COLUMN` and `DROP TABLE` all returned 201.
- **No affected-row count is reported.** The response is `[]` unless the statement uses `RETURNING`.
  Every write in this plan uses `RETURNING`.
- **`read_only: true` genuinely blocks writes** (`25006`), so it works as a second guard on any query
  that is supposed to be a read.
- **`BEGIN` / `ROLLBACK` are honoured**, and multi-statement requests return only the last result set.
- **`jsonb_to_record` with a randomly-tagged dollar-quoted literal is safe** — a payload containing
  `x'; drop table bookmarks; --`, `$$`, a fake tag, backslashes, newlines and emoji round-tripped as
  data, with types coerced correctly.

## Safety model

Chosen deliberately over Supabase-like immediacy, because SuperDB shows several projects at once and
writing to the wrong one is a risk the single-project dashboard does not have.

1. **Preview** — `select count(*) … where <the same predicate>` on the **read-only** endpoint. Tells
   the user how many rows the operation will touch, before anything happens.
2. **Confirm** — a dialog naming the project, the schema and the table, and the row count.
3. **Extra confirmation** for `auth` and `storage`. Not blocked: blocking makes the tool useless
   exactly when it is most needed, repairing one broken `auth.users` row.
4. **Execute** with `RETURNING`, so the real affected count is known rather than assumed.
5. **Record** in `connection_events` — the existing append-only, RLS-scoped audit table.

**There is no undo.** The audit trail records what happened; it does not reverse it. The UI says so.

## Coordination

`plans/260830-0045-table-editor-polish` is independent. But its phase A2 and this plan's B2 both edit
`components/table-editor/grid.tsx` — ship A first, or expect conflicts.

## Definition of done

No write reaches a database without a preview the user confirmed; every write is recorded with its
real affected-row count; a hostile value in any field is stored as data, proven against a live table.
