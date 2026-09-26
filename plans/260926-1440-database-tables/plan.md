---
title: "Database › Tables, against the original"
status: pending
created: 2026-09-26
blockedBy: []
blocks: []
---

# Database › Tables, against the original

Replaces the stand-in table list left by the Schema Visualizer plan with the original's page, its
columns page, and the two table actions this app did not have: edit and duplicate.

Read from the original's source: `Database/Tables/TableList.tsx`, `ColumnList.tsx`, and
`SidePanelEditor.utils.tsx` / `pg-meta/src/sql/studio/table-editor/table.ts` for duplicate.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The list](phase-01-list.md) | pending | ~3h | — |
| 2 | [A table's columns](phase-02-columns.md) | pending | ~2h | 1 |
| 3 | [Edit table](phase-03-edit.md) | pending | ~3h | 1 |
| 4 | [Duplicate table](phase-04-duplicate.md) | pending | ~3h | 1 |

## Already measured (2026-09-26, read only, SuperDB `public`)

One catalog statement gives every row of the original's table, and its numbers match the
original's screenshot exactly — 28, 4, 6, 15, 3, 0, 0, 1 rows; `48 kB`, `144 kB`:

```
201  2515 ms   8 relations
rows  = pg_stat_get_live_tuples(oid)     -- what pg-meta reads
size  = pg_size_pretty(pg_total_relation_size(oid))
realtime = in pg_publication_tables where pubname = 'supabase_realtime'
```

**`reltuples` would have been wrong**: six of the eight tables answer `-1` (never analysed), which
is why the old list's "Rows (est.)" had to be read with a pinch of salt. The publication exists
(`supabase_realtime`, not `FOR ALL TABLES`).

## Settled decisions

- **Row menu**: View in Table Editor, Edit table, Duplicate table, Delete table — the original's four.
  Delete reuses the Table Editor's flow (type the name, audited). Edit and duplicate are new.
- **View columns** opens `/database/tables/[table]`, a read-only list as the original has it.
- **New table** reuses the Table Editor's sheet.
- Every write goes through `lib/ddl-actions.ts`'s `run`: the server rebuilds the statement from the
  inputs rather than running what the browser previewed, and audits it, failures included.

## Gates — measured on ZKVault, never on SuperDB

1. `alter publication supabase_realtime add table` / `drop table` — accepted by the write endpoint?
2. Duplicate: `create table … (like … including all)` keeps what, loses what (foreign keys are
   documented as lost); `insert … select` against identity and generated columns.
