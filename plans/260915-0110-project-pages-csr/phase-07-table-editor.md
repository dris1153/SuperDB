---
phase: 7
title: "Table editor"
status: in-progress
priority: P2
effort: "1.5d"
dependencies: [3]
---

# Phase 7: Table editor

## Overview

`/p/[ref]/tables` stops rendering its data on the server. Added to the plan after the original scope
was extended; it is the hardest page here and the only one whose shape is *not* a fan-out.

## The thing that makes this page different

The overview page awaits eight calls that do not depend on each other. This page awaits a **chain**,
where each step needs the answer from the one before it (`page.tsx` lines 44-138):

```
listSchemas                                  which schemas exist
   ↓ pick the schema from the URL
listTablesIn + getExposedSchemas             which tables, and is the schema exposed
   ↓ pick the table from the URL
describeTable                                the columns
   ↓ the columns decide what can be selected, sorted, filtered
rowCount + listPolicies    and then          selectRows  (or tableDefinition for the DDL view)
```

**Moving a chain to the browser does not parallelise it — it lengthens each link.** Four server-side
hops become four browser → route handler → Supabase hops. Done naively this page gets *slower* than
it is today, not faster, and it is the page people spend the most time on.

**So the chain stays on the server, inside one part.** The browser asks for `rows` with the URL state
it already has; the handler does `describeTable` and then `selectRows` and answers once. Same for
`count`. `resolveProject` and the catalog reads are `cache()`d per request, so a part that needs two
of them pays for them once.

The rule this page sets for the whole plan: **a part may make several upstream calls when they are
data-dependent; the browser never walks a chain.**

## Requirements

**Functional**
- Sidebar (schemas, tables) fills in without blocking the grid area.
- Choosing a table shows the grid's frame and a skeleton, then rows.
- Sorting, filtering, paging and searching re-query without a navigation.
- The Definition view keeps its syntax highlighting.
- Writes keep going through the existing server actions, unchanged.

**Non-functional**
- The URL stays the source of truth for schema, table, page, size, sort, filter, view and search.
- No part walks a chain from the browser.

## Architecture

**Parts**: `schemas`, `tables` (per schema, plus the exposed flag), `columns` (per table),
`rows` (per table + the full URL state), `count` (same inputs as rows), `policies`, `definition`.

**`definition` returns HTML.** `lib/highlight.ts` is `server-only` — Shiki's grammars and WASM never
reach the browser, deliberately — so the part returns `{ ddl, html, complete }` exactly as the page
builds it today. Moving highlighting to the client would put a megabyte of grammars on this route to
colour one tab.

**The URL keeps driving.** `components/table-editor/url.tsx` already owns the query string; query keys
are derived from the same state, so a sort is a key change rather than a navigation. This is where the
page genuinely gets faster: today every sort, filter and page is a round trip that re-renders the
whole page on the server.

**Writes do not move.** `lib/write-actions.ts` and `lib/ddl-actions.ts` stay server actions with their
confirms and their audit trail. After a write, the affected queries are invalidated by key — which
replaces today's `router.refresh()`.

## Related Code Files

- Modify: `app/(app)/p/[ref]/tables/page.tsx`, `components/table-editor/workspace.tsx`,
  `components/table-editor/grid.tsx`, `components/table-editor/sidebar.tsx`
- Extend: `lib/project-parts.ts` with the table parts
- Read for context: `lib/table-editor.ts`, `lib/table-rows.ts`, `lib/table-ddl.ts`,
  `components/table-editor/url.tsx`, `lib/highlight.ts`

## Implementation Steps

1. The table parts, chains kept server-side, with the URL state as their input.
2. The sidebar on queries.
3. The grid: frame and skeleton first, rows when they land.
4. Sort, filter, page and search as key changes rather than navigations.
5. The Definition view, HTML from the server.
6. Invalidate-by-key after every write, replacing `router.refresh()`.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
8. Measure a sort and a page change, before and after.

## Review findings, and what came of them

Reviewed 2026-09-15. The server side was right; the client was still walking two links of the chain
the phase existed to move. Fixed:

- **The browser fetched `rows` using another query's answer.** `table` was read out of the
  `schema-tables` response even when the URL already named it, so a cold load of
  `?schema=public&table=users` spent two serial round trips before the first row was asked for —
  precisely the regression this phase was written to prevent, and the doc comment above the code
  claimed the opposite. The queries key off the URL now; the catalog only *corrects* a schema or
  table the database does not have, which is a rendering concern.
- **The same defect on `schema` cost real upstream calls.** While the catalog was pending every
  branch collapsed to `public`, so a URL naming another schema fetched `public`'s tables first and
  then re-keyed — and if that landed first, `columns`, `policies` and a full `count(*)` fired against
  a table nobody asked for.
- **`rows` can answer `null`** — the reader says so for a table that is no longer there — and three
  places dereferenced it. Reachable by dropping a table: the invalidation refetched `rows` on a URL
  still naming the dropped one. The type says `Rows | null` now, and dropping a table clears it from
  the URL first.
- **A disabled query is `idle`, not `pending`.** In TanStack v5 a disabled query stays pending for
  ever, so the Definition tab left the sidebar dimmed and the search box disabled the whole time it
  was open. `PartState` has an `idle` status and `busy` ignores it.
- **Every key change flashed "Could not read public.users".** `rows === null` means both "waiting"
  and "failed" to the workspace, and without `keepPreviousData` a sort or a page went through null.
  Rows and the definition keep the previous answer while the next is in flight, and the workspace
  tells waiting apart from unreadable.
- **A failed count took the rows with it.** `rowCount` runs a real `count(*)` under the ceiling, and
  a statement timeout used to cost only the footer's total; sharing a part with the rows made it
  refuse both. It degrades to an unknown count.
- Toolbar chips are derived from the URL rather than hidden while the column list loads; `q` is
  trimmed on the export path as the reader trims it; the server's clamped page and size win over the
  client's; the confirm waits for the refetch before closing; `lib/table-query.ts` was orphaned by
  this change and is deleted.

## Success Criteria

- [x] **No part is fetched by the browser using the answer from another fetch** — the rule this
      phase exists for. Every query keys off the URL; the catalog only corrects a name the database
      does not have. The four-hop chain lives in the `rows` reader, one request deep.
- [x] Sorting and paging do not navigate: the URL is written with the history API and the queries
      are keyed on it. A page change costs the `rows` part's 4 upstream calls where the old page
      re-ran all 7.
- [x] The Definition view still highlights, and Shiki is absent from every client chunk — checked in
      the build output, not assumed.
- [x] Every write still runs through its existing confirm, count re-check and audit path: the diffs
      are `useRouter` → `useRefreshTable` and nothing else.
- [x] A write updates the grid without a page refresh, by invalidating `["project", ref]`.
- [x] Row counts, filters and the keyless-table cases behave as before; a failed count now degrades
      to "unknown" instead of taking the rows down with it.
- [ ] **Needs the app.** The sidebar and grid frame painting first, and time-to-first-row on a URL
      that already names a table — the number this phase turns on.
- [x] `/p/[ref]/tables` first load 876,162 → 895,273 bytes.

## Risk Assessment

**Making the page slower.** The chain is the whole risk. If any part ends up fetched from the browser
using data another fetch returned, this page regresses — and it is the most-used one.

**The write paths are the dangerous code in this app.** `docs/table-editor.md` describes preview,
confirm, a re-checked row count and typed statements, all because the database has no undo. None of
that moves in this phase; if a write path has to change to fit the query cache, that is a signal to
stop and reconsider, not to adapt the confirm.

**Stale rows after a write.** `router.refresh()` is replaced by invalidation, and an invalidation that
names the wrong key leaves the grid showing what was there before the write.
