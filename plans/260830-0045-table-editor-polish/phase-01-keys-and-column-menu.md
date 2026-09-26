---
phase: 1
title: "Keys and column menu"
status: completed
priority: P1
effort: "1d"
dependencies: []
completed: 2026-08-30
---

# Phase A1: Keys and column menu

## Deviations from this plan, as built

1. **`column-prefs.ts` holds `{hidden, frozen}` only.** The plan specified `order` as well. A1 has
   nothing that reorders columns, so the field would have been dead weight; A2 adds it, and the
   module's shape already tolerates unknown keys on read.
2. **A "N columns hidden / Show all" banner was added**, which the plan did not call for. Hiding a
   column removes the very header whose menu would unhide it — without the banner the only way back
   is clearing session storage. A control whose effect cannot be undone from the UI is a trap.
3. **`column-model.tsx` was extracted here, not in A2.** The review fixes pushed `grid.tsx` to 237
   lines, past the repo's limit, so A2's planned extraction was pulled forward. `grid.tsx` is now 165.

## Fixed after code review

A review found two defects on this phase's headline features. Both were confirmed in
`react-data-grid`'s own source before fixing, not taken on trust.

1. **Every column-menu interaction also sorted the table and navigated.** react-data-grid attaches
   its sort handler to the header cell itself (`lib/index.js:1445` on click, `:1448` on Space/Enter),
   and the menu renders inside that cell. Radix portals the menu content, which does not help —
   React propagates synthetic events along the React tree, and the portal is still a React
   descendant. Clicking the chevron re-sorted by that column; "Hide column" hid it *and* sorted by
   it. Fixed by stopping propagation on the trigger and the content.
2. **A composite foreign key jumped to a row *set*.** The jump built one predicate from the clicked
   column, so a two-column key filtered the target on half its key. `describeTable` now returns
   `fk_pairs` — every pair of the constraint in key order — and `fkTarget` refuses a target without
   them, making a half-link unrepresentable rather than merely avoided.

Also fixed: a deterministic tiebreak on the FK lateral, since a column can belong to more than one
foreign key and an unordered `limit 1` let the header label and the jump target disagree between two
renders; the Freeze trap (pinning more columns than fit puts their headers out of reach, taking the
menu that would unpin them — the banner now covers both); `save`/`jump` added to the memo deps and
wrapped in `useCallback`; react-data-grid's roving `tabIndex` threaded into the header menu, the FK
button and the expand button; a jump suppressed when a key value was truncated for display, since it
would filter on the first 512 characters and silently match nothing; the disabled-button tooltip
switched to the live-wrapper pattern `toolbar.tsx` already uses; the storage key JSON-encoded so
schema `a.b`/table `c` cannot collide with schema `a`/table `b.c`; stale column names filtered on
write as well as read; hidden columns excluded from the sort-priority badges; and a table named in
the URL but absent from the schema now reported instead of silently replaced by the first table.

**One bug of my own, caught by the runtime:** a backtick inside a SQL comment closed the template
literal in `table-editor.ts`. Comments inside these query strings cannot contain backticks.

Verified: `tsc --noEmit` clean, 114/114 tests, `pnpm build` emits the route. FK resolution checked
live — `public.bookmarks.user_id → auth.users(id)`.

**Composite pairing verified with throwaway tables** (`_sdb_parent`, `_sdb_child`, both dropped,
cleanup confirmed): a parent declared `primary key (b, a)` — deliberately not attnum order — with a
child referencing `(y, x) → (b, a)` resolved to `y→b, x→a`, and the parent's `pk_pos` came back
`b@1, a@2`. That also confirms the `conkey`-order fix from the read-only review against a real
database rather than only in unit tests.

## Overview

The two gaps visible in the reference screenshot: the `→` button inside a foreign-key cell that jumps
to the referenced row, and the dropdown on each column header.

## Requirements

**Functional**
- A cell in a FK column shows a jump affordance; activating it opens the referenced table filtered to
  the referenced row.
- A column header opens a menu: sort ascending, sort descending, freeze, hide, copy name.
- Jumping works across schemas — `public.bookmarks.user_id` references `auth.users`.

**Non-functional**
- The jump is a normal URL change, so back returns to where the user was.
- A FK whose target the user cannot read degrades to a message, not a broken page.

## Architecture

FK navigation reuses the filter machinery that already exists: jumping is just
`?schema=<target schema>&table=<target table>&filter=<target column>.eq.<value>`. No new query, no new
state — the referenced row arrives through the same path as any other filtered read.

`describeTable` currently returns `fk_target` as `schema.table` only. The referenced **column** comes
from `pg_constraint.confkey`, joined back to `pg_attribute` on the referenced relation.

## Related Code Files

**Modify**
- `lib/table-editor.ts` — `describeTable`: replace `fk_target` with `{schema, table, column}`
- `lib/table-view.ts` — `ColumnInfo.fk_target` shape
- `components/table-editor/cells.tsx` — the jump button, header key icons
- `components/table-editor/grid.tsx` — wire `renderHeaderCell` to the menu

**Create**
- `components/table-editor/column-menu.tsx`
- `components/table-editor/column-prefs.ts` — hidden/frozen/order state (shared with A2)

## Implementation Steps

### 1. Referenced column in `describeTable`

The existing FK lateral returns the target relation. Extend it to also return the referenced attribute
name, matching this column's position within `conkey`:

```sql
left join lateral (
  select tn.nspname::text as fk_schema,
         tc.relname::text  as fk_table,
         fa.attname::text  as fk_column
  from pg_catalog.pg_constraint k
  join pg_catalog.pg_class tc on tc.oid = k.confrelid
  join pg_catalog.pg_namespace tn on tn.oid = tc.relnamespace
  join pg_catalog.pg_attribute fa
    on fa.attrelid = k.confrelid
   and fa.attnum = k.confkey[array_position(k.conkey, a.attnum)]
  where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any(k.conkey)
  limit 1
) fk on true
```

`array_position` is what pairs the local column with its counterpart — a composite FK pairs
positionally, and matching by name or ordinal would be wrong.

Verify against `public.bookmarks.user_id`, which references `auth.users(id)`.

### 2. Jump affordance

In `cells.tsx`, a FK column's cell renders its value plus a small `→` button. Clicking it navigates:

```
?schema=<fk_schema>&table=<fk_table>&filter=<fk_column>.eq.<value>&page=1
```

Clear `sort` on the jump — the previous table's sort keys do not exist on the target.

A null FK value renders no button; there is nothing to jump to.

### 3. Target may not be listed

The target schema might not be in the sidebar's list (`HIDDEN` excludes several). Do not silently
produce a dead link: if the target schema is not among the readable ones, render the button disabled
with a title saying which schema it points at.

### 4. Column header menu

`components/ui/dropdown-menu.tsx` is already vendored and still has no consumer outside
`components/ui/` — this is its first.

Items: **Sort ascending**, **Sort descending** (both write `sort` through `useTableUrl`), **Freeze**,
**Hide**, **Copy name**. No Edit or Delete — this is a read-only editor and a dead menu item is noise.

### 5. Column preferences

Freeze and hide need somewhere to live. `column-prefs.ts` holds
`{ hidden: string[], frozen: string[], order: string[] }` keyed by `superdb:cols:{ref}:{schema}.{table}`
in `sessionStorage`, with the same try/catch discipline as `tab-bar.tsx`.

A2 extends this module with reordering; defining it here keeps the two phases from inventing separate
stores.

Hidden columns are removed from the grid only — **not** from the select list. Fetching a column and
not showing it is cheaper than a second round trip when it is unhidden, and the truncation already
bounds the payload.

## Success Criteria

- [x] `pnpm typecheck` clean, 114/114 tests, build emits the route
- [x] Jumping from `public.bookmarks.user_id` lands on `auth.users` filtered to that id
- [x] A composite foreign key pairs columns correctly — verified live with throwaway tables
- [x] A null FK cell shows no jump button
- [x] A FK into a hidden schema shows a disabled button naming the schema, not a broken link
- [ ] Freeze and hide survive a reload; private browsing still renders the page *(needs a signed-in browser)*
- [ ] Back button returns to the originating table *(needs a signed-in browser)*

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Composite FK column pairing is easy to get wrong | `array_position(k.conkey, a.attnum)` indexes `confkey`; verify on a real composite key |
| Hiding every column leaves an empty grid | Keep at least one column visible; the menu disables Hide on the last one |
| `sessionStorage` per table could grow unbounded | Keyed per table, cleared with the session — acceptable |
