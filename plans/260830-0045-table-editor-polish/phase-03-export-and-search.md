---
phase: 3
title: "Export and search"
status: completed
priority: P2
effort: "1d"
dependencies: []
completed: 2026-08-30
---

# Phase A3: Export and search

## Deviations from this plan, as built

1. **Search is `strpos`, not `ilike '%q%'`.** The plan said an or-group of `ilike`. That makes a `%`
   or `_` the user typed into a wildcard — someone searching for `50%` would match everything.
   Substring matching has no pattern syntax to leak. Verified live: searching `%` returns **0 rows**,
   not the whole table.
2. **`EXPORT_LIMIT` lives in `table-export.ts`, not beside the action.** A `"use server"` module may
   only export async functions; a constant declared there fails the build with "The module has no
   exports at all". Found by the build, not by typecheck.
3. **Two modules were split out** to stay under the 200-line rule, both on real concern boundaries:
   `lib/table-filter.ts` (operators, their URL form, `whereClause` — which rows are asked for) out of
   `table-view.ts` (column shape, sort, page size — what the table looks like), and `lib/table-query.ts`
   for URL serialisation, so the route reads as fetch-then-render rather than fetch, assemble query
   strings, render. Filter tests moved with their module.
4. **`rowCount` takes an options object.** It had grown to nine positional parameters, which made one
   call site eleven lines long. The shape change is what let the route fit.
5. **`components/table-editor/table-empty.tsx` added** — both empty states were the same padded box
   with different words.

Verified: `tsc --noEmit` clean, 136/136 tests, `pnpm build` emits the route, every file under 200
lines. Live against a real project: search finds substrings, a literal `%` matches nothing rather
than everything, a hostile search term returns 0 rows, and the export path with truncation off
produces correct CSV.

## Two mistakes of mine, recorded so they are not repeated

- **`perl -0pi -e` ate `${...}` in replacement strings.** `${query.table}` and `${schema}` in a
  template literal were silently replaced with empty strings, leaving `No table or view named  in
  schema .` Typecheck cannot catch it — it is still valid TypeScript. Do not use perl substitution on
  TS or JSX containing template interpolation; use an editor tool.
- **A stray `sed` collapsed every blank line in `table-view.ts`**, reformatting a file well beyond the
  intended change. Rewritten by hand.

## Overview

Getting data out, and finding a row without knowing which column holds it. Both are things a
read-only tool is expected to do and Supabase's editor does.

## Requirements

**Functional**
- Export the current view as CSV or JSON — respecting the active filters and sort.
- Choose between the current page and the whole filtered set, with a cap.
- Search a term across all columns of the table.

**Non-functional**
- Export re-queries rather than serialising what is on screen: the grid holds **truncated** values,
  and an export of silently shortened data is worse than no export.
- The whole-set export is bounded. An unbounded export of a fifty-million-row table through the
  Management API will time out and take the page with it.

## Architecture

Export is a server action returning a string, not a route handler — no new endpoint, and it reuses
`resolveProject` for authorisation like every other project-scoped action.

The action re-runs `selectRows` with truncation disabled and the export limit applied, then formats.
This is the only caller that wants untruncated values in bulk, so `selectRows` grows a `truncate`
flag rather than a second near-identical function.

Search compiles to the existing filter machinery: a term becomes
`col1::text ilike '%term%' or col2::text ilike '%term%' …`. That is an **or** across columns, unlike
the filter builder's **and** across conditions, so `whereClause` needs to express both.

## Related Code Files

**Create**
- `lib/table-export.ts` — CSV and JSON formatting, pure, tested
- `lib/table-export.test.ts`
- `components/table-editor/export-menu.tsx`

**Modify**
- `lib/table-rows.ts` — `selectRows` gains `truncate?: boolean`
- `lib/table-view.ts` — `whereClause` supports an or-group for search
- `lib/table-actions.ts` — `exportRows` server action
- `components/table-editor/toolbar.tsx` — search input, export menu

## Implementation Steps

### 1. CSV formatting — the part that is easy to get wrong

RFC 4180: quote a field when it contains a comma, a quote, CR or LF; double interior quotes. A `NULL`
must be distinguishable from an empty string — emit nothing for null and `""` for empty, and say so
in the export dialog.

Tests, written first:
- a value containing a comma is quoted
- a value containing `"` has it doubled and the field quoted
- a value containing a newline is quoted and survives a round trip
- null and empty string produce different output
- an object (`jsonb`) is JSON-encoded, not `[object Object]`
- the header row uses the column names as they are

Excel's leading-`=` formula injection is a real concern for spreadsheets, but prefixing values would
corrupt legitimate data. Note it in the dialog rather than silently mangling the export.

### 2. Untruncated export

`selectRows({ truncate: false })` skips the `case when length(...)` wrapper and selects the columns
plainly. Only the export action passes it.

### 3. Bounds

Two choices in the menu: **This page** and **All matching rows**, the second capped at 10,000 with the
cap stated in the UI. If the filtered count exceeds the cap, say how many rows were exported out of
how many matched — a truncated export that looks complete is the failure to avoid.

### 4. Delivery

The action returns a string; the client makes a `Blob` and an object URL to trigger the download.
Keeps the whole thing inside the existing action pattern with no new route.

### 5. Cross-column search

An input in the toolbar writes `?q=` to the URL. The server compiles it into an or-group and hands it
to `whereClause` alongside any filters, which stay and-ed. `q` and `filter` combine as
`(<filters and-ed>) and (<search or-ed>)`.

Search casts every column to text — that is correct here, unlike ordering comparisons, because a
substring match on a number is a text operation by definition.

Skip columns whose type cannot cast to text usefully, and note that this is a sequential scan: on a
large table it is slow, and the UI should not pretend otherwise.

## Success Criteria

- [x] `pnpm typecheck` clean; 136/136 tests, including the newline and quote cases
- [ ] Exported CSV opens in a spreadsheet with columns intact *(needs a browser)*
- [x] An exported wide value is complete — verified live with truncation off
- [ ] Exporting more than the cap reports it *(no table large enough to test against)*
- [x] Search finds a row by a value in any column, and combines with filters using and
- [ ] Search and filters both appear in the URL and survive a reload *(needs a browser)*

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Untruncated export of wide rows is a large response | Hard cap; state it; keep the page-only option as the default |
| Search is a sequential scan | Say so in the UI; it is a correctness-over-speed choice, not an oversight |
| CSV injection into spreadsheets | Documented in the dialog rather than corrupting values |
| `whereClause` gaining or-groups could weaken the and-path | Existing filter tests stay; add or-group tests beside them |
