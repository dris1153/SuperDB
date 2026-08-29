---
phase: 2
title: "Editor chrome"
status: completed
priority: P2
effort: "2d"
dependencies: [1]
completed: 2026-08-29
---

# Phase 02: Editor chrome

## Deviations from this plan, as built

1. **Filter comparisons do not cast the column to text.** This plan said to use `col::text = 'value'`
   so one quoting rule covers every type. That is wrong for ordering: `'9' > '10'` is true as text.
   The literal is left untyped instead, so Postgres coerces it to the column's own type
   (`"id" > '5'` compares as an integer). Only `like`/`ilike` cast, because pattern matching needs text.
2. **The row panel refetches the row.** This plan described the panel as "where untruncated values
   live" — but P1's fix truncates in SQL, so the grid's copy is already cut. The panel calls a new
   server action, `lib/table-actions.ts::getFullRow`, addressing the row by primary key. A table
   without a primary key cannot be addressed, and says so instead of pretending.
3. **`getExposedSchemas`, not `getPostgrestConfig`.** The endpoint is
   `/v1/projects/{ref}/postgrest` — `config/postgrest` is a 404. Its response also contains
   `jwt_secret`, so the helper returns only the schema list; no caller can hand the whole object to a
   client component by accident. Same hazard `ApiKey.api_key` already carries in that module.
4. **Policy roles handle PUBLIC.** `pg_policy.polroles` is `{0}` for a policy applying to PUBLIC, and
   oid 0 matches no `pg_roles` row, so the roles column came back null on the most common case.
5. **`lib/table-rows.ts` split out** of `table-editor.ts`, and `components/table-editor/workspace.tsx`
   out of the route, to stay under the repo's 200-line rule. Catalog reads and row reads are now
   separate modules.
6. **Filtered counts are never estimated.** `reltuples` describes the whole table, so a filtered count
   above the exact-count ceiling reports "unknown" rather than a number that does not answer the
   question asked.

Verified: `tsc --noEmit` clean, 111/111 tests, `pnpm build` emits the route, and every new query ran
against a live project — numeric and `ilike` filters, `is null`, a filtered count, `listPolicies`
returning `roles=public`, and `fetchFullRow` by primary key. A filter value of `x' or '1'='1`
returned **0 rows** against a real table, which is the behaviour that matters.

## Overview

Everything around the grid that makes the page read as Supabase's Table Editor rather than a generic
table: multi-table tab bar, toolbar with sort and filter builders, RLS policy panel, row expand, and
column header menus.

## Requirements

**Functional**
- Several tables open at once as tabs; closing and reordering works; state survives a reload.
- Sort by any column, ascending or descending, applied server-side.
- Filter rows by column with the common operators.
- See how many RLS policies a table has, and read them.
- Expand a row to read every value in full.
- Column header menu: sort, freeze, copy name.
- The globe marker shows which tables are actually exposed through the API.

**Non-functional**
- Sort and filter run as SQL, not client-side over the current page — a filter that only searches the
  visible 100 rows is a lie.
- Every user-supplied filter value goes through the same literal-quoting discipline as P1's
  identifiers.

## Architecture

Tab list lives in `sessionStorage` keyed by project ref; the **active** table stays in the URL. Tabs
are a working-session convenience, not addressable state, and this is exactly the kind of per-viewer
convenience the repo already puts in browser storage (`lib/vault-store.ts` sets the precedent, and
the same defensive try/catch applies — private browsing must degrade, not crash).

Sort and filter are URL parameters, so they flow through the same server refetch as P1.

## Related Code Files

**Create**
- `components/table-editor/tab-bar.tsx`
- `components/table-editor/toolbar.tsx`
- `components/table-editor/sort-builder.tsx`
- `components/table-editor/filter-builder.tsx`
- `components/table-editor/rls-panel.tsx`
- `components/table-editor/row-panel.tsx`
- ~~`lib/sql-literal.ts`~~ — **already exists** as `quoteLiteral` in `lib/sql-ident.ts`, pulled forward
  in P1 because catalog lookups needed it. Reuse it; do not create a second module.

**Modify**
- `lib/table-editor.ts` — `listPolicies`, filter/sort clause building
- `lib/mgmt-api.ts` — `getPostgrestConfig`
- `components/table-editor/grid.tsx` — header menu, expand button wiring
- `components/table-editor/sidebar.tsx` — globe marker

## Implementation Steps

### 1. Tab bar

`sessionStorage` key `superdb:tabs:{ref}`, value a list of `{schema, table}`. Opening a table from the
sidebar appends it if absent and makes it active. Closing removes it and activates a neighbour.
Wrap every storage read and write in try/catch, following `lib/vault-store.ts`.

The `+` button opens the sidebar's table search rather than a second picker — one way to choose a
table, not two.

### 2. Filter values — reuse `quoteLiteral`

This is the first place a **user-typed** value reaches SQL; P1 only ever interpolated catalog
identifiers and clamped integers. The quoting primitive already exists — `quoteLiteral` in
`lib/sql-ident.ts`, with tests covering interior quotes, an `x' or '1'='1` payload, backslashes left
alone under `standard_conforming_strings`, NUL rejection, and the empty string.

What is left for this phase is the *use* of it: cast on the SQL side (`col::text = 'value'`) so one
quoting rule covers every column type, rather than branching per Postgres type.

### 3. Filter builder

Rows of `{column, operator, value}`. Operators: `=`, `<>`, `>`, `<`, `>=`, `<=`, `like`, `ilike`,
`in`, `is null`, `is not null`. Serialise into the URL as repeated `filter=col.op.value` params, the
same flat style `sort=col.asc` already uses.

`is null` / `is not null` take no value — the builder must not emit an empty literal for them.

### 4. Sort builder

Multiple sort keys, each `{column, direction}`. Emitted as `sort=col.asc,col2.desc`. Always append the
PK as the final tiebreaker so pagination stays deterministic even when the user sorts on a
non-unique column — the same reasoning that made `ORDER BY` mandatory in P1.

### 5. RLS panel

Badge in the toolbar showing the policy count; clicking opens a `Sheet` listing them read-only.

```sql
select p.polname::text as name,
       p.polcmd::text as command,
       pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expr,
       pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
from pg_catalog.pg_policy p
join pg_catalog.pg_class c on c.oid = p.polrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = <schema> and c.relname = <table>
order by p.polname;
```

Put a line in this panel stating that the grid itself is **not** filtered by these policies — the
query role has `rolbypassrls`. Without it the badge implies a filtering that is not happening.

### 6. Row expand panel

A `Sheet` showing every column of one row as label + full value, with a copy button per value and
`jsonb` pretty-printed. This is where untruncated values live, which is what lets the grid truncate
aggressively.

### 7. Column header menu

`DropdownMenu` per header: Sort ascending, Sort descending, Freeze column, Copy name. Edit and Delete
are **omitted, not disabled** — this is a read-only editor and a dead menu item is noise.

Note `components/ui/dropdown-menu.tsx` is already vendored but currently unused anywhere; this is its
first real consumer.

### 8. Globe marker

Add `getPostgrestConfig(token, ref)` to `lib/mgmt-api.ts`
(`GET /v1/projects/{ref}/config/postgrest`) and read its exposed-schema list. Show the globe on
tables whose schema is exposed. Wrap in `safe()` — if the call fails, drop the icon rather than
guessing.

### 9. Toolbar assembly

Left: filter input opening the filter builder. Right: Sort, RLS badge, refresh, and a disabled
**Insert** button whose tooltip says the editor is read-only.

Omitted deliberately: the **Role switcher** and **ask AI**. The role switcher is impossible on this
API (probed 2026-08-29 — the query role is a member of no other role) and a permanently dead control
is a lie rather than a roadmap, the same call `components/project-nav.tsx` makes about
`Integrations`. There is no AI backend.

## Success Criteria

- [ ] `pnpm test` passes including new `sql-literal` tests
- [ ] `pnpm typecheck` clean
- [ ] Open three tables as tabs, reload, tabs are still there
- [ ] A filter with a value containing `'` returns correct rows and does not error
- [ ] Sorting on a non-unique column still pages deterministically
- [ ] The RLS panel lists real policies and states the bypass caveat
- [ ] Private-browsing mode (storage blocked) still renders the page
- [ ] No control on the page is rendered disabled without a reason the user can read

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Filter values are the first user input reaching SQL | `lib/sql-literal.ts` with tests written first; cast to `::text` so one rule covers all types |
| Tab state desyncs from URL | URL owns the active table; storage owns only the list. One direction of truth each |
| Toolbar grows past 200 lines | Sort and filter builders are already separate files |
| `config/postgrest` may 403 on some tokens | `safe()` — drop the icon, never block the page |
