---
phase: 2
title: "Row editing"
status: pending
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase B2: Row editing

## Overview

The user-visible half of writing rows: an insert sheet, inline cell editing, and deleting selected
rows — each behind the preview-and-confirm gate from B1.

This is the phase that makes the Insert button in the toolbar stop being disabled.

## Requirements

**Functional**
- Insert a row through a form built from the column list, with defaults pre-filled.
- Edit a cell in place and save it.
- Select rows and delete them.
- Every operation shows how many rows it will affect and which project, and waits for confirmation.
- `auth` and `storage` require a second confirmation.

**Non-functional**
- Only rows with a primary key are editable. Without one there is nothing to address a row by — the
  same limit the row detail sheet already states.
- Views and matviews are never editable.
- The UI says plainly that there is no undo.

## Architecture

The selection checkbox column was **removed** in the read-only phase because nothing acted on a
selection. It returns here with something to do.

Editing is optimistic in appearance only: the cell shows a pending state, the server action runs, and
the page revalidates. No local mutation of the row list — the server's copy is the truth, and pretending
otherwise is how a grid ends up showing a value the database rejected.

```
cell edit ──▶ confirm dialog (affected: 1) ──▶ updateRow action ──▶ revalidate
insert    ──▶ sheet ──▶ confirm ──▶ insertRow action ──▶ revalidate
delete    ──▶ select rows ──▶ confirm (affected: N) ──▶ deleteRows action ──▶ revalidate
```

## Related Code Files

**Create**
- `components/table-editor/insert-sheet.tsx`
- `components/table-editor/write-confirm.tsx` — the shared confirmation dialog
- `components/table-editor/cell-editor.tsx`

**Modify**
- `components/table-editor/grid.tsx` — selection column, `renderEditCell`
- `components/table-editor/toolbar.tsx` — enable Insert, add Delete for a selection
- `lib/write-actions.ts` — `insertRow`, `updateCell`, `deleteRows`

## Implementation Steps

### 1. `write-confirm.tsx` — build this first

Every write goes through it, so its shape decides how safe the rest feels. It shows:

- the operation, in plain words
- **the project name and ref** — SuperDB has several projects open at once, which is exactly the risk
  the single-project dashboard does not have
- schema and table
- the affected row count from B1's preview
- a line stating there is no undo

For `auth` and `storage`, a second step: the user types the table name to proceed. Not a block —
repairing a broken `auth.users` row is a legitimate thing to need — but enough friction that it cannot
happen by reflex.

### 2. Editability rules

Compute once, on the server, and pass down:

```
editable = kind === 'r' && columns.some(c => c.pk_pos != null)
```

When false, Insert stays disabled with a tooltip saying why: a view, or no primary key. Two different
reasons, two different messages — "not editable" alone tells the user nothing they can act on.

Generated and identity columns are not editable either, and the insert form should omit rather than
disable them.

### 3. Insert sheet

A form from `ColumnInfo`: name, type, nullability and default. Leaving a field untouched should mean
*use the column default*, which is different from writing null — so the form tracks touched state
rather than treating an empty input as an explicit null.

Input types follow the column: checkbox for `bool`, a textarea for `json`/`jsonb`/`text`, plain input
otherwise. No date picker in this phase; an ISO string is unambiguous and Postgres parses it.

### 4. Inline cell editing

`react-data-grid`'s `renderEditCell`. Commit on blur or Enter, cancel on Escape.

A cell whose value was **truncated** by the grid must not be editable in place — saving would write the
shortened value back and silently destroy data. Those cells open the row detail sheet for editing
instead, where the full value is fetched. This follows directly from the truncation introduced in the
read-only phase and is the subtlest bug available in this phase.

### 5. Delete

Selection returns to the grid. Delete asks B1 for the affected count, then confirms. Deleting rows
across pages is not supported — the selection is per page, which is all it can honestly claim.

### 6. Revalidation

`revalidatePath` on the tables route after each successful write, matching `project-actions.ts`.

## Success Criteria

- [ ] `pnpm typecheck` clean, tests pass
- [ ] Insert, edit and delete all work against a throwaway table on a live project
- [ ] A truncated cell cannot be edited in place; it opens the detail sheet instead
- [ ] A table without a primary key shows Insert disabled with a reason naming the cause
- [ ] A view shows Insert disabled with a different, accurate reason
- [ ] Writing to `auth` requires typing the table name
- [ ] Every confirmation dialog names the project
- [ ] An untouched field in the insert form uses the column default, not null
- [ ] Every write lands in `connection_events`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Editing a truncated cell writes back the shortened value | Truncated cells are not inline-editable; the detail sheet fetches the full row |
| Empty input read as null when a default was intended | Track touched state per field; omit untouched fields from the statement |
| Wrong project edited | Project name and ref in every confirmation |
| Optimistic UI shows a value the database rejected | No local mutation; revalidate and show the server's copy |
| Selection spans pages the user cannot see | Selection is per page and says so |
