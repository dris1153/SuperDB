---
phase: 4
title: "Sidebar and menus"
status: completed
priority: P3
effort: "0.5d"
dependencies: []
completed: 2026-08-30
---

# Phase A4: Sidebar and menus

## Deviations from this plan, as built

1. **The toolbar overflow menu was not built.** The plan said it collects Export (A3) and Reset layout
   (A2), and that it should be skipped rather than shipped empty. Both of those turned out to already
   have homes — Export is its own toolbar button, Reset layout sits in the column menu where a person
   is already adjusting columns. A `⋮` duplicating two controls that are both visible is noise by the
   same standard that removed the Role switcher and the dead menu rows. Skipped, deliberately.
2. **`table-list.tsx` and `table-menu.tsx` split out** of the sidebar, as the plan's own risk row
   anticipated. The shell keeps the schema picker, search and collapse; the list owns filtering and
   the per-table menu.
3. **Switching table or schema now also clears filters and search**, not just sort. They reference
   columns of the table being left; the server drops them anyway, so leaving them in the URL only
   made the address bar describe something that was not happening.
4. **Collapsed state is stored once**, alongside density, for the same reason — it describes the
   person, not the table.

Verified: `tsc --noEmit` clean, 136/136 tests, `pnpm build` emits the route, every file under 200
lines.

## Overview

The remaining chrome from the reference screenshot: collapsing the sidebar, a per-table context menu,
a filter on the table list, and the toolbar's overflow menu.

The most droppable phase in this plan. Nothing here changes what the editor can do — it changes how
much screen it takes and how many clicks some things need.

## Requirements

**Functional**
- Collapse the sidebar and restore it; the choice persists.
- Per-table menu: copy name, copy a `select` statement, view definition.
- Filter the table list by type (table / view) and by whether RLS is on.
- Toolbar overflow menu collecting export and layout reset.

**Non-functional**
- Collapsed state is per browser, alongside the other view preferences.
- No entry appears that cannot do anything.

## Architecture

Entirely client-side. No new queries — `listTablesIn` already returns `kind` and `rls`, which is
everything the filter needs.

## Related Code Files

**Modify**
- `components/table-editor/sidebar.tsx` — collapse, filter popover, per-table menu
- `components/table-editor/toolbar.tsx` — overflow menu
- `components/table-editor/column-prefs.ts` — sidebar collapsed flag

**Create**
- `components/table-editor/table-menu.tsx`

## Implementation Steps

### 1. Collapse

A chevron in the sidebar header, mirroring the screenshot's control. Collapsed renders a narrow rail
with the table icons only, tooltips on hover — the same pattern `components/sidebar.tsx` already uses
when the path starts with `/p/`. Reuse that idiom rather than inventing a second one.

### 2. Per-table menu

`⋮` on hover, `DropdownMenu`:

- **Copy name** — `schema.table`, quoted if it needs quoting
- **Copy select statement** — `select * from "schema"."table" limit 100;` through `quoteQualified`
- **View definition** — navigates to `?view=definition` for that table

No Rename, Duplicate, Truncate or Delete. Those belong to the writes plan, and a disabled row that
never becomes enabled in this plan is noise.

### 3. Table list filter

The funnel icon beside the search box opens a small popover: **Tables** / **Views** checkboxes, and
**RLS enabled only**. Filters the already-fetched list client-side.

Worth having because the sidebar shows tables *and* views together, which the read-only plan chose
deliberately — this is what makes that choice comfortable on a schema with many of both.

### 4. Toolbar overflow

`⋮` on the right of the toolbar, matching the screenshot's position: export (from A3) and reset
layout (from A2). If A2 and A3 are not built, this phase has nothing to collect and should be skipped
rather than shipped empty.

## Success Criteria

- [x] `pnpm typecheck` clean, 136/136 tests, build emits the route
- [ ] Sidebar collapses, restores, and remembers across a reload *(needs a browser)*
- [ ] Copy select statement produces SQL that runs unchanged *(needs a browser clipboard)*
- [x] A mixed-case table name is correctly quoted — both copies go through `quoteQualified`
- [ ] Filtering to views only hides every ordinary table *(needs a browser)*
- [x] No menu entry is present that does nothing — the overflow menu was skipped for that reason

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The overflow menu is empty without A2 and A3 | Skip this phase rather than shipping an empty menu |
| Collapsed sidebar plus the project nav rail leaves two icon rails side by side | Check against the existing `/p/` rail collapse before committing to the width |
| `sidebar.tsx` is at 122 lines and grows here | Extract the table list into its own component if it approaches 200 |
