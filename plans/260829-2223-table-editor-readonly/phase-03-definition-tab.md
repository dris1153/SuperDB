---
phase: 3
title: "Definition tab"
status: completed
priority: P3
effort: "1d"
dependencies: [1]
completed: 2026-08-30
---

# Phase 03: Definition tab

## Deviations from this plan, as built

1. **`lib/table-ddl.ts` is its own module.** The plan put `tableDefinition` in `table-editor.ts`;
   ~70 lines of SQL would have pushed that file past the repo's 200-line rule.
2. **Identity and generated columns are handled, not skipped.** The plan's risk table proposed
   falling back to a plain column listing for them. They turned out to be cheap —
   `attidentity` and `attgenerated` are four lines — and Supabase projects use identity columns
   constantly, so skipping them would have made the common case wrong.
3. **Partitioned parents render, labelled partial.** Rather than refusing, the output is shown with a
   warning that the partitioning clause is not reconstructed. `complete: false` drives that banner.
4. **A caveat is shown in the UI, not just the plan.** Catalog-derived DDL emits
   `default nextval('t_id_seq'::regclass)`, which needs the sequence to exist first. The panel says so
   rather than implying the SQL is a complete, runnable backup.

Verified against a live project: `public.bookmarks` and `public.study_sessions` produce columns with
defaults, FK and PK constraints, a secondary index, the `enable row level security` line and their
policy; `pg_catalog.pg_views` correctly returns a `create view … as` body instead of a fabricated
table. Shiki's `sql` grammar loads and emits coloured output.

## Overview

The Data / Definition toggle's second half: a syntax-highlighted `CREATE TABLE` statement
reconstructed from the catalog, plus constraints, indexes, RLS state and policies.

Last phase because it is the least bounded piece of the feature.

## Requirements

**Functional**
- Toggling to Definition shows valid, readable SQL for the selected table.
- Covers columns with types and defaults, `NOT NULL`, primary key, foreign keys, unique and check
  constraints, indexes, `ENABLE ROW LEVEL SECURITY`, and policies.
- A copy button yields SQL that would actually recreate the table.
- Views and materialised views show their definition instead of a synthesised `CREATE TABLE`.

**Non-functional**
- One round-trip. Multi-statement SQL is accepted by the endpoint but **only the last result set is
  returned** (probed 2026-08-29), so the DDL must be assembled inside a single statement returning
  one text column.
- Highlighting happens on the server, like every other snippet in this app.

## Architecture

Postgres has no `pg_get_tabledef`. The statement is assembled in SQL from catalog builtins, all of
which were confirmed reachable over the read-only token:

| Piece | Source |
|---|---|
| Columns, types | `pg_attribute` + `pg_catalog.format_type` |
| Defaults | `pg_attrdef` + `pg_catalog.pg_get_expr` |
| Constraints (PK, FK, unique, check) | `pg_constraint` + `pg_catalog.pg_get_constraintdef` |
| Indexes | `pg_index` + `pg_catalog.pg_get_indexdef` |
| RLS flag | `pg_class.relrowsecurity` |
| Policies | `pg_policy` + `pg_catalog.pg_get_expr` |
| View / matview body | `pg_catalog.pg_get_viewdef(oid, true)` |

Assembled with `string_agg` and `format`, returned as a single `text` column, then passed through the
existing Shiki highlighter.

## Related Code Files

**Create**
- `components/table-editor/definition.tsx`

**Modify**
- `lib/table-editor.ts` — `tableDefinition(token, ref, schema, table)`
- `lib/highlight.ts` — add `"sql"` to the `Lang` union and the `LANGS` array
- `components/table-editor/footer.tsx` — enable the Definition half of the toggle
- `app/(app)/p/[ref]/tables/page.tsx` — fetch the definition when `view=definition`

## Implementation Steps

### 1. Teach the highlighter SQL

`lib/highlight.ts` currently loads seven grammars. Add `"sql"` to both the `Lang` union type and the
`LANGS` array — one line each. The module already caches a single lazily-created highlighter, so
there is nothing else to do.

### 2. `tableDefinition` in `lib/table-editor.ts`

Build the whole statement in SQL and return `select <text> as ddl`. Shape:

```sql
select
  'create table ' || <qualified> || ' (' || E'\n'
  || (select string_agg('  ' || quote_ident(a.attname) || ' '
        || pg_catalog.format_type(a.atttypid, a.atttypmod)
        || coalesce(' default ' || pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
        || case when a.attnotnull then ' not null' else '' end,
        ',' || E'\n' order by a.attnum)
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
  || coalesce(',' || E'\n' || (select string_agg('  constraint ' || quote_ident(k.conname)
        || ' ' || pg_catalog.pg_get_constraintdef(k.oid), ',' || E'\n' order by k.contype, k.conname)
      from pg_catalog.pg_constraint k where k.conrelid = c.oid), '')
  || E'\n);' || …
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = <schema> and c.relname = <table>;
```

Then append, in order: indexes not already implied by a constraint
(`pg_get_indexdef` where `indisprimary` is false and no matching unique constraint), the
`alter table … enable row level security` line when `relrowsecurity`, and one `create policy`
statement per row of `pg_policy`.

Branch on `relkind` first: `v` and `m` return `pg_get_viewdef(c.oid, true)` wrapped in
`create [materialized] view … as`, not a synthesised `CREATE TABLE`.

`quote_ident` here is Postgres's own function running server-side — unrelated to `lib/sql-ident.ts`,
which quotes the identifiers *we* interpolate into the query text.

### 3. `components/table-editor/definition.tsx`

Receives pre-highlighted HTML as a prop, same contract as `components/connect-primitives.tsx`'s
`CodeBlock`: render the HTML when present, fall back to a plain `<pre>` when highlighting returned
`null`. Reuse `Copyable` from that file rather than writing a third copy button.

### 4. Wire the toggle

`view=definition` in the URL. The page fetches the definition only for that value — no reason to pay
for DDL synthesis on every row page.

## Success Criteria

- [x] `pnpm typecheck` clean; 111/111 tests; `pnpm build` emits the route
- [x] Definition of a table with a FK, a PK and a secondary index is complete (verified live)
- [x] An RLS-enabled table shows both the `enable row level security` line and its policies
- [x] A view shows its `select` body, not a fabricated `create table`
- [x] Identifiers are quoted through `quoteQualified`, so mixed-case names and reserved words are safe
- [x] Highlighting falls back to plain text — `CodeBlock` already handles a null from Shiki
- [ ] The generated SQL, pasted into a fresh database, recreates the table — **not verified, and known
      to be incomplete**: sequence-backed defaults reference a sequence the DDL does not create, and
      partitioning is not reproduced. The panel states both rather than implying a runnable backup.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| DDL synthesis is the least bounded piece here | Verify by round-tripping the output into a scratch database, not by eyeballing it |
| One statement only — no multi-result batching | Assemble inside a single SQL statement; accept a second round-trip for views if it gets unwieldy |
| Generated columns, identity columns, partitions and inherited tables have shapes the naive query misses | Scope explicitly to ordinary and partitioned tables plus views; anything else falls back to a plain column listing rather than emitting wrong SQL |
| Copy button implies the SQL is exact | If a table hits an unsupported shape, say so above the block instead of silently emitting incomplete DDL |
