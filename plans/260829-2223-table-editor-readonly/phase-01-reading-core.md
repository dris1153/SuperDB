---
phase: 1
title: "Reading core"
status: completed
priority: P1
effort: "2d"
dependencies: []
completed: 2026-08-29
---

# Phase 01: Reading core

## Deviations from this plan, as built

1. **`quoteLiteral` landed in P1, not P2.** The plan assumed P1 only interpolated catalog identifiers.
   It does not: every catalog lookup compares a name as text (`where n.nspname = 'public'`), which is a
   string literal. Folded into `lib/sql-ident.ts` rather than creating the separate `lib/sql-literal.ts`
   P2 called for — P2's filter builder now reuses it.
2. **`lib/table-view.ts` added** (not in the plan). `footer.tsx` needs `PAGE_SIZES` as a *value*, and
   `lib/table-editor.ts` is `server-only`, so the build breaks — the exact failure `lib/project-status.ts`
   exists to avoid. It holds `PAGE_SIZES`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `SortKey`,
   `ColumnInfo`, `parseSort`, `serialiseSort` and `orderClause`. It imports `./sql-ident.ts` with an
   explicit extension — required because a `node:test` file imports it directly and Node has no
   bundler to fall back on.
3. **`short_type` added to `ColumnInfo`.** Live verification showed `format_type` returns
   `timestamp with time zone`, but the Supabase editor's headers show `timestamptz` / `int4` / `uuid` —
   that is `pg_type.typname`. Both are kept: short for headers, resolved for detail views.
4. **Row-expand button omitted.** The plan listed it in P1 while its panel is P2; shipping a dead
   button is the thing this plan criticises elsewhere.
5. **Sort wired in P1.** The plan put the sort builder in P2 but already had `sort=` in P1's URL.
   `react-data-grid` has sortable headers built in, so sorting runs server-side through `ORDER BY`
   from the start. The multi-key *builder* UI remains P2.

6. **Row-selection checkbox column removed.** Nothing in a read-only browser acts on a selection, and
   keeping it caused two real defects (selection persisted across table and page changes; composite
   keys collided). It returns in P2 alongside copy/export, which gives it something to do.
7. **Cell values truncated in SQL** at 512 characters for unbounded types (`text`, `varchar`, `json`,
   `jsonb`, `xml`, `bytea`, `citext` and their array forms), with the ellipsis appended by Postgres.
   The plan deferred this as YAGNI; review showed 500 rows of a wide `jsonb` column is a
   multi-hundred-megabyte payload, and the grid virtualises the DOM so it would look fine in testing
   right up until it did not.
8. **Row counts are skipped for views, matviews and partitioned parents.** `reltuples` is -1 for views
   (measured against `pg_catalog` views on a live project), so the "never analysed means small" rule
   that holds for tables would have full-scanned a view on every render. Those now read
   "count unavailable" rather than a wrong number or a hung query.

Verified: `tsc --noEmit` clean, 98/98 tests, `pnpm build` emits the route, every query runs against a
live project (including `pk_pos` ordering, truncation returning 513 chars ending in `…`, and a view
correctly returning a null count), and the `.superdb-grid` override block is present unlayered in the
built CSS. `int8` past `Number.MAX_SAFE_INTEGER` was confirmed to arrive as a JSON string, so large
identifiers do not lose precision.

Not verified: browser rendering — every route is behind auth and no credentials were available.

## Overview

A working table browser at `/p/[ref]/tables`: schema switcher and table list in the sidebar, rows in
a `react-data-grid`, pagination in the footer. Ships alone and is the bulk of the feature's value.

## Requirements

**Functional**
- Pick a schema, pick a table, see its rows.
- Column headers show name + Postgres type, with PK/FK markers.
- Page through rows; choose 100 / 500 per page.
- Footer shows a record count that does not time out on large tables.
- Paused projects and restricted tokens degrade to a reason string, never a crash.

**Non-functional**
- Every identifier reaching SQL passes through `quoteIdent`; every integer through `clampInt`.
- Pagination is deterministic — no duplicated or skipped rows between pages.
- No client-side data fetching. URL is the state; the server refetches.

## Architecture

```
/p/[ref]/tables?schema=public&table=bookmarks&page=1&sort=id.asc
        |
        v
page.tsx (server, force-dynamic)
  resolveProject(ref)          -> token + project      [React cache(), already exists]
  Promise.all:
    listSchemas(token, ref)
    listTablesIn(token, ref, schema)
    describeTable(token, ref, schema, table)
    selectRows(token, ref, schema, table, {order, limit, offset})
    countRows(...)             -> estimate, exact only when small
        |
        v
  <Sidebar/>  <Grid rows columns/>  <Footer/>     (client leaves, props only)
```

Client components write the URL with `router.replace` inside `startTransition` and dim the grid while
pending — the same `opacity-50` idiom `components/connect-framework-panel.tsx:134` already uses.

### Why URL-driven

Follows `components/interval-picker.tsx`: the client writes the URL, the **server** refetches. The
token is server-side either way, so URL state costs nothing extra and buys back-button, shareable
links, and one code path. The grid stays a dumb component receiving `rows` and `columns`.

## Related Code Files

**Create**
- `lib/sql-ident.ts` — `quoteIdent`, `quoteQualified`, `clampInt`
- `lib/sql-ident.test.ts`
- `lib/table-editor.ts` — types + five queries
- `app/(app)/p/[ref]/tables/page.tsx`
- `components/table-editor/sidebar.tsx`
- `components/table-editor/grid.tsx`
- `components/table-editor/footer.tsx`

**Modify**
- `package.json` — add `"react-data-grid": "7.0.0-beta.61"` (exact, no caret)
- `app/globals.css` — map `--rdg-*` variables onto existing tokens
- `lib/db-introspect.ts` — export `HIDDEN` for reuse
- `components/project-nav.tsx` — `{ slug: "tables", …, ready: true }`

## Implementation Steps

### 1. `lib/sql-ident.ts` (+ test first)

```ts
/** Postgres identifier quoting. Not only injection defence: an unquoted `MyTable` or `order` breaks. */
export const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;
export const quoteQualified = (schema: string, name: string) =>
  `${quoteIdent(schema)}.${quoteIdent(name)}`;

/** LIMIT/OFFSET are interpolated, so they must be integers within a known band. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number { … }
```

Tests to write before the implementation:
- round-trips a plain name
- doubles interior `"` — `he"llo` → `"he""llo"`
- preserves case — `MyTable` stays `MyTable` inside quotes
- a reserved word (`order`) survives
- an injection attempt (`x"; drop table y; --`) ends up inert inside one quoted identifier
- `clampInt` rejects `NaN`, floats, negatives, strings, `Infinity`, and values over `max`

### 2. `lib/table-editor.ts`

`import "server-only"`. All five queries go through the existing `readOnlyQuery`.

**Schemas** — reuse the exported `HIDDEN`; it already keeps `auth` and `storage`, which is what the
dropdown wants. Sort `public` first.

```sql
select n.nspname::text as name
from pg_catalog.pg_namespace n
where n.nspname not in (…HIDDEN…) and n.nspname not like 'pg\_%'
order by (n.nspname = 'public') desc, n.nspname;
```

**Tables in a schema** — include views and matviews; the editor can read them.

```sql
select c.relname::text as name, c.relkind::text as kind, c.relrowsecurity as rls,
       c.reltuples::bigint as est_rows,
       pg_catalog.obj_description(c.oid, 'pg_class')::text as comment
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = <schema literal> and c.relkind in ('r','p','v','m')
order by c.relname;
```

**Columns** — drives grid headers.

```sql
select a.attnum::int as ordinal,
       a.attname::text as name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
       not a.attnotnull as nullable,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid) as default_expr,
       coalesce(pk.hit, false) as is_pk,
       fk.target as fk_target
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
left join lateral (
  select true as hit from pg_catalog.pg_constraint k
  where k.conrelid = c.oid and k.contype = 'p' and a.attnum = any(k.conkey) limit 1
) pk on true
left join lateral (
  select (tn.nspname || '.' || tc.relname)::text as target
  from pg_catalog.pg_constraint k
  join pg_catalog.pg_class tc on tc.oid = k.confrelid
  join pg_catalog.pg_namespace tn on tn.oid = tc.relnamespace
  where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any(k.conkey) limit 1
) fk on true
where n.nspname = <schema> and c.relname = <table>
  and a.attnum > 0 and not a.attisdropped
order by a.attnum;
```

**Rows** — `ORDER BY` is mandatory. `LIMIT/OFFSET` without it makes pagination non-deterministic:
Postgres may return the same row on two pages and skip another. Default order is the primary key
ascending (all columns of a composite PK, in `conkey` order); if there is no PK, the first column.

```
select * from <quoteQualified> order by <quoted cols> <dir> limit <clamped> offset <clamped>
```

**Count** — exact `count(*)` is O(n) and times out through the Management API on a large table.

- `reltuples` from the table list is the estimate. Render `~1.2M`.
- Run exact `count(*)` only when the estimate is under 50 000.
- `reltuples = -1` means the table was never analysed — treat as unknown and take the exact count;
  such tables are almost always new and small.

### 3. Route — `app/(app)/p/[ref]/tables/page.tsx`

Copy the shape of `app/(app)/p/[ref]/database/page.tsx`: `export const dynamic = "force-dynamic"`,
`await params` and `await searchParams`, `resolveProject(ref)` → `notFound()` when missing, then one
`Promise.all` with every call wrapped in `safe()` / `attempt()`.

Resolve defaults server-side: no `schema` → `public`; no `table` → first in the list; no `sort` → the
PK. Validate `schema`/`table` against the fetched lists **before** they reach SQL — a name that is
not in the catalog is not queried at all.

### 4. `components/table-editor/sidebar.tsx`

Schema `Select`, a search `Input` filtering the list client-side, and the table list. Each row shows
name, and a lock icon when `rls` is on. Selecting a table writes the URL inside `startTransition`.

Omit the globe icon in this phase — it means "exposed through the API", which needs the PostgREST
config. An icon that is merely a guess is worse than no icon. It lands in P2 with the real source.

### 5. `components/table-editor/grid.tsx`

`"use client"`, `import "react-data-grid/lib/styles.css"`.

- `columns` built from `describeTable`: `key` = column name, `renderHeaderCell` = name + type +
  PK/FK icon.
- Two frozen leading columns: selection checkbox and the row-expand button.
- `rowKeyGetter` — PK value when there is one, else the row index.
- Cell rendering rules, since everything arrives as JSON from the API:
  - `null` → `NULL`, italic, `text-subtle`
  - object / array (`jsonb`) → `JSON.stringify(v)`, truncated with CSS
  - boolean → `true` / `false`
  - long text → CSS truncate; the full value belongs to the P2 expand panel
- Dim to `opacity-50` while the parent transition is pending.

### 6. Theme mapping in `app/globals.css`

`react-data-grid` ships its own variable system. Map it onto the existing tokens under a wrapper
class rather than editing the vendored CSS:

```css
.rdg { /* scoped to the grid wrapper */
  --rdg-color: var(--foreground);
  --rdg-background-color: var(--background);
  --rdg-header-background-color: var(--card);
  --rdg-row-hover-background-color: var(--muted);
  --rdg-border-color: var(--border);
  --rdg-selection-color: var(--primary);
  --rdg-font-size: 0.8125rem;
}
```

Budget real time here. Verify the rendered grid, not just that the variables exist — this repo has
already been burned once by tokens that resolved while no utility class was generated
(`plans/260824-2318-shadcn-ui-migration/reports/brainstorm-report.md`).

### 7. Footer — `components/table-editor/footer.tsx`

Page back/forward, page number, rows-per-page `Select` (100 / 500 only — never "all", a wide `jsonb`
table would return megabytes), record count, and the Data / Definition toggle rendered but with
Definition disabled until P3.

### 8. Flip the nav

`components/project-nav.tsx` → `{ slug: "tables", label: "Table Editor", icon: IconTable, ready: true }`.

## Success Criteria

- [x] `pnpm test` passes — 98/98, including 25 `sql-ident` and 13 `table-view` tests
- [x] `pnpm typecheck` clean
- [x] `pnpm build` emits `/p/[ref]/tables`
- [x] Queries run against a live project; rows, columns, PK order and counts all correct
- [x] Identifier quoting proven against a live database: a table named
      `x"; drop table bookmarks; --` is rejected as one unknown relation, not executed as two statements
- [x] A table with an RLS policy shows its rows (the query role bypasses RLS)
- [x] A view's footer reads "count unavailable" instead of full-scanning
- [ ] Open any table in any connected project and page through it *(needs a signed-in browser)*
- [ ] Paging forward then back returns the identical rows *(needs a signed-in browser)*
- [ ] A paused project shows a reason string, not a crash *(no paused project available to test)*
- [ ] Sidebar and grid render correctly against the dark-only palette, verified in the browser

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `--rdg-*` CSS mapping is more work than it looks | Budgeted as its own step; verify visually, not by grepping for variables |
| Beta API drift between `react-data-grid` releases | Pin exact `7.0.0-beta.61` |
| `grid.tsx` grows past the 200-line rule | Extract cell renderers into `components/table-editor/cells.tsx` as soon as it approaches |
| Wide `jsonb` rows produce multi-MB payloads | Cap rows-per-page at 500; revisit only if it actually bites (YAGNI) |
| RSC navigation feels frozen | `useTransition` on every URL write, `opacity-50` while pending |
| `reltuples = -1` on unanalysed tables | Handled explicitly — fall back to exact count |
