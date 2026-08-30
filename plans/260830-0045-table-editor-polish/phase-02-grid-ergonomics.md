---
phase: 2
title: "Grid ergonomics"
status: completed
priority: P2
effort: "1d"
dependencies: [1]
completed: 2026-08-30
---

# Phase A2: Grid ergonomics

## Deviations from this plan, as built

1. **Density is stored once, not per table.** The plan filed it with the column preferences, which
   are per table. But density describes how a person likes to read a grid, not anything about a
   particular table, so per-table storage would mean setting it again for every table opened.
2. **A `DensityProvider` context was added**, which the plan did not anticipate. The toolbar control
   and the grid that obeys it are siblings under a Server Component, so neither can own the state.
   It is the only piece of view state both halves need; column layout stays inside the grid.
3. **Only user-resized widths are persisted.** `react-data-grid` reports `{type: 'resized' |
   'measured'}` and also hands back widths it worked out itself. Storing those would pin every column
   to whatever the first render happened to fit, which is not what "remember my layout" means.
4. **`column-model.tsx` was extracted in A1, not here** — the review fixes pushed `grid.tsx` past the
   limit first. A second extraction, `grid-interactions.ts`, was needed in this phase for the same
   reason: copy, reorder and resize are the handlers that only move things around and touch no data.
5. **`onCellCopy` is required, not optional.** `react-data-grid` copies nothing on its own — verified
   in its source at `lib/index.js:2039`, where `handleCellCopy` does nothing but forward to the
   handler. Without it, Ctrl+C on a cell is silently inert.

Verified: `tsc --noEmit` clean, 115/115 tests, `pnpm build` emits the route, every file under the
200-line rule.

**Process note:** running `npx prettier --write` on `page.tsx` reformatted the whole file to 80
columns — 93 insertions for a three-line change. The repo has no formatter config and its own style
is wider. The file was rewritten by hand; ignoring whitespace the change is 16 lines. Do not run a
formatter on this repo without one being configured first.

## Overview

The handling that makes a wide table workable: copy cells, reorder and pin columns, and pick a row
density. All of it is `react-data-grid` capability that is currently switched off — only `resizable`
is enabled today.

## Requirements

**Functional**
- Select a cell or a range and copy it to the clipboard.
- Drag a column header to reorder; pinned columns stay left while scrolling.
- Choose compact / normal row height.
- Column width, order, pinning and hidden state survive a reload.

**Non-functional**
- Preferences are per browser, not shared — they describe how one person is looking at a table, not
  what the table is.
- Clipboard failure outside a secure context degrades silently, as `copy-button.tsx` already does.

## Architecture

Everything here is client-side and touches no SQL. `column-prefs.ts` from A1 gains `order` and
`width`; `TableGrid` reads the stored preferences and applies them to the column list it builds.

**Decision — `sessionStorage`, not the URL.** The brainstorm left this open. Column layout is a
per-viewer convenience with no meaning to anyone the link is shared with, and putting six columns'
widths in a query string makes every URL unreadable. Filters and sort stay in the URL because they
change *what data* is shown; layout does not.

## Related Code Files

**Modify**
- `components/table-editor/column-prefs.ts` — add `order`, `width`
- `components/table-editor/grid.tsx` — `onCellCopy`, `draggable`, `onColumnsReorder`, `onColumnWidthsChange`, frozen columns, `rowHeight`
- `components/table-editor/column-menu.tsx` — pin/unpin reflects stored state
- `components/table-editor/toolbar.tsx` — density control

## Implementation Steps

### 1. Cell copy

`react-data-grid` exposes `onCellCopy(args, event)`. Write the cell's value as text; for an object
(a `jsonb` column that was not truncated) write `JSON.stringify`. Wrap in try/catch — clipboard access
throws outside a secure context.

Note the values may be **truncated** — the grid cuts wide values off in SQL. Copying a truncated value
silently would hand someone incomplete data. Either copy the ellipsis with it, so the truncation is
visible in what they paste, or fetch the full row first. Prefer the former: it is honest and cheap.

### 2. Reorder and pin

- `draggable: true` per column plus `onColumnsReorder(sourceKey, targetKey)` → persist `order`.
- Pinned columns get `frozen: true`. The expand column is already frozen and must stay leftmost.
- `onColumnWidthsChange` → persist `width`.

Apply stored `order` when building `gridColumns`; unknown names in stored order are ignored, so a
dropped column does not break the layout.

### 3. Density

Two heights — compact (28px) and normal (36px, current). A `Select` in the toolbar, stored with the
other preferences. Not a URL parameter, for the same reason as the rest.

### 4. Reset

The column menu gains **Reset layout**, clearing the stored preferences for that table. Without it a
mis-drag on a fifty-column table is very annoying to undo by hand.

## Success Criteria

- [x] `pnpm typecheck` clean, 115/115 tests, build emits the route, all files under 200 lines
- [ ] Copy a cell, paste it somewhere — the value matches, and a truncated value pastes with its ellipsis *(needs a signed-in browser)*
- [ ] Reorder, pin, resize and hide all survive a reload *(needs a signed-in browser)*
- [x] A stored layout referring to a column that no longer exists degrades instead of breaking — `usable()` filters on read and on write
- [ ] Private browsing (storage throws) still renders the grid *(needs a browser)*
- [ ] Reset layout restores the default order *(needs a signed-in browser)*

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Copying a truncated value hands over incomplete data as if it were whole | Copy the ellipsis; the row detail sheet remains the way to get the full value |
| `grid.tsx` is already 109 lines and grows here | Extract column construction into `column-model.ts` when it approaches 200 |
| Stored prefs outlive a schema change | Filter stored names against the live column list on every render |
