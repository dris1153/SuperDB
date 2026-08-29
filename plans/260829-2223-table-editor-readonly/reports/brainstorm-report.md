---
type: brainstorm-report
date: 2026-08-29
feature: Table Editor (read-only)
nav_slug: tables
status: approved
---

# Table Editor — read-only, full-fidelity

Approved 2026-08-29. Fills the `tables` nav slug, which has sat `ready: false` in
`components/project-nav.tsx` since the workspace plan.

## Problem

`/p/[ref]/tables` is the first of eleven disabled nav items and the one users reach for first —
browsing rows is the whole reason to open a database. Target: Supabase's own Table Editor UI
(screenshot supplied), reading only.

## Settled scope

| Decision | Choice | Rejected |
|---|---|---|
| Write capability | **Read-only.** Insert/New table render disabled ("soon" pattern, as nav already does) | DML (row edit); DDL |
| UI fidelity | **Full**, incl. multi-table tab bar | core-only; core + toolbar |
| Grid | **`react-data-grid`, pinned exact `7.0.0-beta.61`** | hand-rolled on `ui/table`; TanStack Table |
| Data flow | **URL-driven, server-fetched** | client fetch via server action |
| Role switcher | **cut** — probed 2026-08-29, not possible over this API | keep at P2 |
| Definition tab | keep, phase 3 | cut |

## Why read-only was the right cut

Management API `POST /v1/projects/{ref}/database/query` takes a **SQL string with no bind
parameters**. Supabase's own dashboard avoids this by calling internal `pg-meta`. Any DML here means
concatenating user values into SQL — classic injection, aimed at the user's own database.

There is a correct way (collapse every value into **one** dollar-quoted JSON literal with a random
tag, then `jsonb_to_record` server-side — one escape point instead of N, and testable), but it is
real work, not a detail. Deferred deliberately.

`Database: Write` scope is **already registered** on the OAuth app, so adding DML later needs no
re-authorization. The blocker is safety, not permission.

**Rejected: PostgREST + service_role key** (would give parameterization for free). `listApiKeys`
returns **403** on OAuth connections (missing `api_gateway_keys_read`), and PostgREST only sees
exposed schemas — loses `auth`/`storage`. Dead end.

## Grid library — verified, not assumed

- Supabase Studio ships `react-data-grid@7.0.0-beta.47`, pinned exact
  (`apps/studio/package.json`).
- Last non-prerelease is **`6.1.0`, published 2019**, peer `react: ^16`. The 7.x beta line *is* the
  maintained mainline: beta.61 released 2026-07-14, peer `react: ^19.2` — matches this project's
  `react: ^19.2.0`. MIT, 373 KB unpacked.
- "Beta" here is a version label, not an abandonment signal. Pin exact; do not use `^`.

## Data flow — URL-driven

```
/p/[ref]/tables?schema=public&table=vault_config&page=1&sort=user_id.asc&view=data
```

Follows the `IntervalPicker` precedent (`components/interval-picker.tsx`): client writes the URL,
the **server** refetches. Chosen over the `FrameworkPanel` client-fetch pattern because the token is
server-side either way, so URL state buys back-button, shareable links, and a single code path. Grid
becomes a dumb client component receiving `rows`/`columns` as props.

**Mandatory consequence:** the app has no `loading.tsx` anywhere. Page/sort changes are RSC
navigations; without `useTransition` pending state the UI freezes visibly. Not optional.

Sole exception: the **open-tab list** goes to `sessionStorage` keyed by project ref. Working-session
convenience, not addressable state.

## SQL layer — `lib/table-editor.ts` (server-only)

Six queries through the existing `readOnlyQuery`. Endpoint rejects unqualified entity references —
schema-qualify everything.

| Query | Feeds |
|---|---|
| `listSchemas()` | schema dropdown |
| `listTablesIn(schema)` | sidebar: name, RLS flag, est rows, comment |
| `describeTable(s,t)` | grid headers: name, `format_type`, PK/FK icons, nullable, default |
| `selectRows(s,t,{order,limit,offset})` | grid body |
| `countRows(s,t)` | footer record count |
| `tableDefinition(s,t)` | Definition tab (P3) |

### Three traps that must be handled

1. **`quoteIdent()` — `lib/sql-ident.ts` + test.** Catalog identifiers flow into SQL strings. Wrap in
   `"`, double any interior `"`. This is *correctness* before it is security: a table named
   `MyTable` or a column named `order` breaks without it. `limit`/`offset` coerced to int and
   clamped, never interpolated raw. Pure function → gets its own test file, matching the repo's
   existing test philosophy.
2. **`ORDER BY` is mandatory.** `LIMIT/OFFSET` without it makes pagination non-deterministic — rows
   duplicate or vanish across pages. Default PK asc; no PK → first column asc. Always emit one.
3. **`count(*)` is a performance trap.** Exact count is O(n); on a 50M-row table it times out through
   the Management API. Use `reltuples` as estimate and render `~1.2M`; run exact count only when the
   estimate is under ~50k, or on click.

## What read-only does to the screenshot's chrome

Most of it stays functional — the disabled surface is small and matches the "soon" pattern already
used in `project-nav.tsx`.

| Real | Disabled |
|---|---|
| schema switcher, table search, tab bar, sidebar collapse | **Insert** button |
| Sort builder, Filter builder, Refresh | **New table** |
| `N RLS policies` badge → read-only policy list | Edit/Delete in column dropdown |
| ~~Role switcher~~ — **removed, see below** | Edit/Duplicate/Delete in table ⋮ |
| row expand, pagination, rows-per-page | `ask AI` in the filter box (no AI backend) |
| Data / Definition toggle | checkbox selection limited to copy/export, no bulk delete |

### Role switcher — CUT. Probed and impossible.

Probed 2026-08-29 against a live project with a full-access PAT (`scripts/probe-token.mjs`, extended
for this). Findings:

| Question | Answer |
|---|---|
| Query role | **`supabase_read_only_user`** (session and current), not `postgres` |
| Multi-statement accepted? | **Yes** — but only the **last** statement's result is returned |
| Roles this role can `SET`? | **none** — `anon`, `authenticated`, `authenticator`, `postgres`, `service_role` all `pg_has_role = false` |
| `set local role authenticated` | `42501 permission denied to set role` on both `/query/read-only` and `/query` |

Multi-statement was never the blocker — it works. The blocker is role membership: there is no role to
switch *to*. Supabase Studio can offer this because it connects with real Postgres credentials
through its own pooler, not through the Management API.

**Decision: drop the control entirely, do not render it disabled.** Same reasoning
`components/project-nav.tsx` already applies to `Integrations` — every other greyed item can be
enabled later, so a permanently dead control is a lie rather than a roadmap.

### The finding that actually mattered: RLS does not hide rows

The role has **`rolbypassrls = true`** (`rolsuper = false`, `rolcanlogin = true`). Verified against a
live RLS-enabled table: `public.bookmarks` (`relrowsecurity = true`) returned its rows.

This was the single assumption that could have sunk **P1**, not P2 — catalog reads against
`pg_class` are unaffected by RLS, so the existing Database page proved nothing about reading actual
rows. Confirmed: the Table Editor can read every row of every table, protected or not.

Consequence for the product: the grid is **not** RLS-filtered and never shows "what a user sees".
Matches Supabase's own dashboard behaviour, but worth stating in the UI rather than leaving implied.

## File layout

```
app/(app)/p/[ref]/tables/page.tsx          server: resolve + parallel queries
components/table-editor/sidebar.tsx        schema select, search, list, per-table menu
components/table-editor/tab-bar.tsx        sessionStorage tabs keyed by ref
components/table-editor/toolbar.tsx        filter, sort, RLS badge, role, refresh, Insert(off)
components/table-editor/grid.tsx           react-data-grid wrapper + token mapping
components/table-editor/row-panel.tsx      expand-row detail
components/table-editor/footer.tsx         pagination, rows/page, count, Data|Definition
components/table-editor/definition.tsx     DDL + Shiki
lib/table-editor.ts                        six queries + types
lib/sql-ident.ts + lib/sql-ident.test.ts   quoteIdent, clampInt
```

All files under the repo's 200-line rule. `grid.tsx` is the likeliest to bloat.

**Free reuse:** `lib/highlight.ts` already caches a Shiki highlighter server-side. Adding `"sql"` to
its `Lang` union and `LANGS` array is a one-line change and the Definition tab is covered.

## Phases

| Phase | Contents | Outcome |
|---|---|---|
| **P1** | route, `lib/table-editor.ts`, `sql-ident` + tests, sidebar, grid + theme mapping, footer pagination | Working table browser |
| **P2** | tab bar, full toolbar, RLS panel, role switcher, row expand, column dropdown | Matches the screenshot |
| **P3** | Definition tab | Complete |

P3 is last because it is the least bounded piece: Postgres has no `pg_get_tabledef`, so
`CREATE TABLE` must be synthesized from the catalog — columns, defaults, not-null, plus constraints
via `pg_get_constraintdef`, indexes via `pg_get_indexdef`, then RLS and policies. ~80 lines of SQL
and the most fragile part of the feature.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | `react-data-grid` ships its own `--rdg-*` CSS variable system; mapping onto the dark-only tokens is real work | Budget it explicitly in P1; Supabase does the same |
| 2 | Beta API drift between releases | Pin exact `7.0.0-beta.61` |
| 3 | ~~`set local role` unverified~~ | **Resolved 2026-08-29** — impossible; feature cut |
| 4 | Wide `jsonb` columns × 100 rows → multi-MB payloads | Don't pre-optimize (YAGNI); cap rows/page at 500, never offer "all" |
| 5 | RSC navigation feels frozen without pending state | `useTransition` on every URL write |
| 6 | Total ~1,100–1,400 LOC | That is what "full fidelity" costs; phased so P1 ships alone |

## Success criteria

- Open any table in any connected project, page through it, sort by any column, with stable
  pagination across pages (no duplicate/missing rows).
- Mixed-case and reserved-word identifiers render and query correctly.
- `sql-ident` tests pass alongside the existing 60.
- A table with millions of rows renders its footer without timing out.
- Paused projects and restricted tokens degrade to a reason string, not a crash — matching
  `safe()`/`attempt()` handling on the Database page.
- `tsc --noEmit` clean.

## Next steps

1. ~~Probe `set local role`~~ — **done 2026-08-29**, see above.
2. `/ck:plan` → phase files for P1–P3.
3. Flip `ready: true` on the `tables` entry in `components/project-nav.tsx` when P1 lands.

## Open questions

- Which schemas belong in the switcher — reuse `HIDDEN` from `lib/db-introspect.ts`, or show more
  than the Database page does?
- Exact-count threshold: 50k is a guess, not a measurement.
- Multi-statement returns only the last result set. Confirm the Definition tab's DDL synthesis fits
  in a single statement, or accept one round-trip per catalog query.
