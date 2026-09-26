---
title: "Database › Enumerated Types, against the original"
status: in-progress  # built and measured; the sheets unclicked signed in
created: 2026-09-26
blockedBy: []
blocks: []
---

# Database › Enumerated Types, against the original

The page the column panel's *Create enum types* button opens, and that button. Read from the
original's source: `Database/EnumeratedTypes/` and `ColumnEditor.tsx`.

## One phase

| Status | Effort |
|---|---|
| in-progress | ~4h |

### What the original has

- **The button** sits in the column panel's Data Type aside, above *About data types*, and opens
  `/database/types` in a new tab. Nothing more.
- **The page**: *Database Enumerated Types* and its sentence; schema picker, *Search for a type*,
  *Docs*, *Create type*. Schema / Name / Values (joined by commas), ⋮ with *Update type* and
  *Delete type*. Empty: *No enumerated types created yet*.
- **Create**: Name, Description, Values — the warning that values cannot be deleted or sorted after
  creation, a drag handle per value, *Add value*, a delete per value.
- **Update**: rename, description, and **new values only** — existing ones are locked, because
  Postgres can add to an enum but not remove from or reorder it.
- **Delete**: a confirm naming the type, with the original's advice to check it is unused.

### Architecture

- Part `enum-types` (`?schema=`): `pg_type` joined to `pg_enum`, labels in `enumsortorder`.
- Pure `lib/enum-statements.ts` (+ test): `create type … as enum`, `alter type … add value` per new
  value then the comment then the rename **last**, `drop type`. Labels are literals, quoted; a label
  is at most 63 bytes (Postgres's limit for one) and unique.
- `lib/enum-actions.ts` through `run`: the update re-reads the type on the server, so a value the
  browser thinks is new but is not is refused before it is sent.
- Drag to reorder with the repo's `pragmatic-drag-and-drop`; the grip also answers ArrowUp and
  ArrowDown, because HTML5 drag cannot be driven from the keyboard.

### Gate — ZKVault, dropped after

1. `create type` with a label containing a quote.
2. Two `add value` plus a comment plus a rename in one request — `add value` inside the implicit
   transaction the endpoint runs a request in.
3. `drop type` while a column uses it: what Postgres answers.

### Success criteria

- [ ] The button opens the page in a new tab.
- [x] Create, update (add values, rename, comment) and delete each run as previewed and are audited — the statements measured on ZKVault; the sheets not clicked.
- [x] An existing value cannot be edited or removed from the update sheet.
- [ ] Dragging reorders a new type's values, and the order is the created one.

## Built 2026-09-26

All three gates answered on ZKVault — see `docs/database.md`. The list was rendered from SuperDB's
real `auth` enums (nine, read only) and the create sheet opened over it, in a throwaway route, and
compared with the screenshots. Not clicked: the drag, the sheets' Save, and Delete.

One thing on the way that was not this feature's: a build failed on `.next/dev/types/routes.d.ts`,
which had been half-overwritten — the running dev server regenerating it while a build ran. The two
generated files were removed so the dev server writes them afresh.
