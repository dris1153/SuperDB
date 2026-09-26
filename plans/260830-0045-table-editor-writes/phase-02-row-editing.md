---
phase: 2
title: "Row editing"
status: completed
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase B2: Row editing

## Constraints inherited from B1's review — decide these before writing UI

The review of the write layer surfaced four things this phase must answer. None is a defect in B1;
each is a decision B1 deliberately left open, and building the dialogs without settling them first
would bake in the wrong answer.

1. **Cascade and triggers are invisible to both the preview and the count.** `buildCount` counts rows
   in the target table and `RETURNING` reports rows of the target table. Neither sees
   `ON DELETE CASCADE`, `SET NULL`, or a trigger writing elsewhere. Deleting one `auth.users` row on a
   schema with a dozen cascading references could remove tens of thousands of rows while the dialog
   says "1 row" and the result says "1 row deleted" — **both lying in the same direction.** This is
   the largest risk in the plan and appears in no risk table before this one.
   `describeTable` already finds foreign keys pointing *out*; the dialog needs the ones pointing *in*
   (`pg_constraint` where `confrelid` is the target, `confdeltype in ('c','n','d')`). An exact count
   is not required — naming the tables that will also be touched is enough to change a decision.
2. **Nothing binds the preview to the write.** `countAffected` and `deleteRows` are separate actions;
   a write can run without any preview ever happening, and the table can change in between. The
   brainstorm's own criterion — *no write reaches the database without a preview the user confirmed*
   — is currently a UI convention, not a property of the layer. Pass the confirmed count back with
   the write and refuse on a mismatch.
3. **There is no optimistic concurrency control.** Both update and delete match on the primary key
   alone, so an edit lands on whatever the row has become since it was read. That is normal editor
   behaviour, but on a layer that calls itself strict, runs as `postgres` and has no undo it should be
   a recorded decision rather than an omission. Cheapest option: select `xmin` with the rows and add
   it to the predicate.
4. **A `jsonb` column round-trips wrong.** The read path returns `jsonb` as *text*; feeding that text
   back to a `jsonb` target stores a JSON **string**, not the object. Measured: writing `"{\"a\":1}"`
   produced `jsonb_typeof = string`. The editing UI must parse a `json`/`jsonb` cell before sending
   it, or every edit of such a column double-encodes silently.

Two smaller ones: `insertRows` cannot address a table with no primary key at all (`returningKey`
throws — an INSERT does not actually need a key to confirm), and `isGuardedSchema` exists in
`table-writes.ts` but nothing calls it yet; this phase is where it gets used.

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

## Outcome

Built as planned, with four decisions worth recording.

**The confirmation dialog carries the input.** The plan had the cell editor collect a value and the
dialog confirm it. Splitting them meant confirming a value shown somewhere else, and a parse error
had nowhere to be reported — the editor was already closed. So `WriteConfirm` gained a `children`
slot and a `blocked` flag: the value in the dialog *is* the value that will be sent, and a
`json`/`jsonb` field that will not parse disables the action rather than failing at the server.

**Truncated cells route through the row detail sheet, which is now editable.** rdg's `editable` takes
a per-row predicate, so a shortened cell simply does not open an editor; its hover text says why. The
sheet's Edit button stays disabled until `getFullRow` has returned, because seeding the editor from
the grid's copy is exactly the data loss this rule exists to prevent. After a write from the sheet,
the sheet closes — it holds a snapshot the write has just invalidated.

**Generated columns are now refused by the SQL layer, not only the UI.** `rejectGenerated` runs over
the columns a statement *writes*, never the key: `generated always as identity` on a primary key is
the ordinary Supabase shape, and rejecting it there would make such a table uneditable. Verified live
in both directions.

**No optimistic concurrency control** (constraint 3 above). `updateRow` still matches on the primary
key alone. What binds the edit is the confirmed count re-checked at write time, plus the dialog line
saying the row may have changed since it was loaded. `xmin` in the predicate stays available if this
proves insufficient; adding it now would be a guess at a problem nobody has reported.

**Revalidation is `router.refresh()`, not `revalidatePath`** (step 6). The tables route is
`force-dynamic` and its rows are read per request, so there is no cache entry to invalidate; the
refresh re-runs the server component with the URL's filters and paging intact, which a path
revalidation would not preserve. Every write component does it the same way.

Not deviations, but decided here: `parseValue` sends `""` as NULL on a nullable column, so an empty
string cannot be written to one through the editor — the dialog says `empty writes NULL` rather than
leaving it to be discovered. A no-op edit (text unchanged) never opens the dialog.

### Review findings and what was done

The review of this phase raised eleven. Nine were real and are fixed; each was reproduced before the
fix and re-measured after.

**`isTruncated` counted the wrong unit — the phase's own top risk, reached.** `left(x, 512)` counts
code points; `String.length` counts UTF-16 units. A truncated value containing any astral character
therefore failed the length test, so the cell stayed inline-editable *and* `rejectTruncated` let it
through — the shortened value would have been written over the real one, with `affected: 1` and no
undo. Measured: the 512-character prefix of `repeat('🙂', 300) || repeat('a', 400)` arrives with
`.length === 813`. Now counted with `[...value].length`, with a test carrying the emoji prefix.

**A confirmed count of zero was confirmable, and reported as success.** With a full primary key an
update can only affect 0 or 1 row, and 0 always means the row is gone; the write ran, matched
nothing, returned `ok: true, affected: 0`, and the dialog closed exactly as on success. `WriteConfirm`
now blocks at zero and says so, which fixes the delete path at the same time.

**The `auth`/`storage` gate was skipped for every write after the first.** `typed` was cleared in
`onOpenChange`, which Radix does not call when a parent closes the dialog by flipping `open` — and
that is what every success path does. So the second write to `auth` in a session had no friction at
all. Cleared on open instead.

Also fixed: every row on a view or keyless table shared the React key `"[]"` (`rowKeyGetter` now
falls back to rdg's row index); an array column round-tripped as `[1,2,3]`, which Postgres rejects as
a *malformed array literal* — arrays are now sent as JSON arrays, which `jsonb_to_record` builds
directly; `parseValue` accepted `TRUE`/`t`/`yes` for a boolean while the confirmation's switch, bound
to `value === "true"`, showed false — the inline editor is now a three-option select and `parseValue`
takes only `true`/`false`; `buildCount` and `buildDelete` did not call `rejectTruncated`, so a
shortened primary key matched nothing and read as success; the row panel's Edit button claimed to be
loading forever when `getFullRow` had actually failed; and Escape during an in-flight write dismissed
the dialog and swallowed the outcome.

Two were not acted on, and a second review round confirmed both. **The stale-editor commit is not
reachable**: rdg's `closeOnExternalRowChange` defaults to true (`index.js:373-383`) and runs in the
body of `useActivePosition`, so a replaced rows prop drops the editor to ACTIVE during the very
render that sees it, before any handler can fire; `commitEditorChanges` then early-returns on
`mode !== "EDIT"`. **Five API round trips per edit** is real (`describeTable` is fetched twice) but
the second read is not validation alone — `recordList` interpolates `data_type` straight into the
SQL, so a cached catalog would build a statement against a shape the database may no longer have.
That is the same class of lie constraint 2 exists to prevent.

### Second round: two regressions, introduced by the fixes above

Both were found by re-reviewing the fixes, and both were narrower than the bugs they replaced —
which is exactly why they needed a second pass rather than a declaration of done.

**Gating `rowKeyGetter` alone turned Shift+Space into a crash.** rdg derives selectability from
`selectedRows != null && onSelectedRowsChange != null` (`index.js:1851`), not from the key getter, so
those two staying on kept `isSelectable` true while the getter went undefined — and `handleCellInput`
asserts on it (`index.js:2056-2061`). On any view or keyless table, one keystroke threw and unmounted
the grid: a hard crash on the read-only path, worse than the duplicate keys it replaced. All three
props are now gated on one `selectable`.

**Requiring JSON for arrays made every wide array column uneditable.** `table-rows.ts` splits array
types in two: `_int4` is read raw and arrives as `[1,2]`, but `_text` is wide, so it is cast and
arrives as the Postgres literal `{urgent,billing}`. The first fix was measured against `int4[]` only
and mandated JSON, so `text[]` — by far the more common — started failing with *"this is not valid
JSON"* about a value the grid itself had just produced. Postgres accepts both notations, so both are
now accepted: a JSON array wins if the text parses as one, otherwise the text goes as a literal and
Postgres judges it. Verified live in both directions for both types.

Also taken from that round: `rejectTruncated` in `keyRows` moved *after* the narrowing to the primary
key, so it judges the columns the statement matches on rather than whatever the caller passed (no
current caller was affected, but the function's own contract promised the narrowing); and
`isArrayColumn` now reads `data_type.endsWith("[]")` from `format_type` rather than the `_` prefix on
`typname`, which a user-defined type named `_status` could otherwise fake.

`parseValue` moved to `lib/cell-value.ts`. It decides what every write actually stores, it had broken
twice in two rounds, and inside a `.tsx` file no `node:test` could reach it. It now has 11 tests
covering each type branch, including the two round-trip notations for arrays and the boolean forms
that used to make the switch disagree with the write.

### Verified live

Against `public.superdb_probe_b2`, created and dropped on a real project, exercising the same builders
the UI calls: DEFAULTs survive an insert that omits the column; `jsonb` stores `jsonb_typeof=object`
rather than a double-encoded string; `bool` coerces from the text `"true"`; a NULL write lands; a
stored generated column recomputes; `buildCount` returns 0 for a missing key; an identity primary key
still addresses rows for update and delete; and `rejectGenerated` refuses a write to `shout`.

After the review fixes, on `public.superdb_probe_fix`: an `int4[]` column round-trips through a JSON
array in both directions; `bool` writes `true` and `false`; a truncated value carrying emoji is
recognised and refused by both the write guard and the key guard; and count and delete still agree.

After the second round, on `public.superdb_probe_arr2`: a wide array column read through the grid's
own select list comes back as `"{urgent,billing}"` while `int4[]` comes back as `[1,2]`, and
`jsonb_to_record` accepts *both* notations into either target — `{urgent,archived}` and
`["urgent","archived"]` both land as the same `text[]`, and `"{}"` lands as an empty array.

## Success Criteria

- [x] `pnpm typecheck` clean, tests pass (187), `pnpm lint` clean, `pnpm build` clean
- [x] Insert, edit and delete all work against a throwaway table on a live project
- [x] A truncated cell cannot be edited in place; it opens the detail sheet instead
- [x] A table without a primary key shows Insert disabled with a reason naming the cause
- [x] A view shows Insert disabled with a different, accurate reason
- [x] Writing to `auth` requires typing the table name
- [x] Every confirmation dialog names the project
- [x] An untouched field in the insert form uses the column default, not null
- [x] Every write lands in `connection_events`

The last five are read from the code, not clicked through a browser: `WriteConfirm` is the only path
to a write and it always renders the project name and the guarded-schema step, and `run()` in
`write-actions.ts` records on both success and failure. The live verification above covers the SQL
those paths produce, not the React that reaches them.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Editing a truncated cell writes back the shortened value | Truncated cells are not inline-editable; the detail sheet fetches the full row |
| Empty input read as null when a default was intended | Track touched state per field; omit untouched fields from the statement |
| Wrong project edited | Project name and ref in every confirmation |
| Optimistic UI shows a value the database rejected | No local mutation; revalidate and show the server's copy |
| Selection spans pages the user cannot see | Selection is per page and says so |
