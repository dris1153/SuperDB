---
title: "The column editor, against the original"
status: in-progress  # built and measured; the panel not clicked through signed in
created: 2026-09-26
blockedBy: []
blocks: []
---

# The column editor, against the original

One panel for adding and editing a column, as the original has, in its five sections. It replaces
`ColumnEditSheet` and `AddColumnSheet` everywhere they open — the Table Editor's grid and table menu,
and Database › Tables › columns.

| Section | Original | This app today |
|---|---|---|
| General | Name (with a naming hint), Description | Name |
| Data Type | Type with icons, Define as array, Is Identity, Default Value | Type, raw default |
| Foreign Keys | a list, and *Add foreign key* | — |
| Constraints | Is Primary Key, Allow Nullable, Is unique, CHECK | Not null |
| Data Privacy | Mark as sensitive data | — |

**Data Privacy is left out.** It is a dashboard-side masking flag, not a Postgres object, and the
Management API has no endpoint for it; there is nowhere for this app to keep it.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Facts and statements: one read, one pure builder, measured on ZKVault | **completed** |
| 2 | The panel: five sections, shared by add and edit | in-progress |
| 3 | Foreign keys: the list and the add dialog | in-progress |

## Phase 1 — facts and statements

A `column-facts` part (`?schema&table&column`, column empty for a new one) reads, with
`search_path` emptied as the table facts read does: the column's element type and whether it is an
array, comment, default, nullability, identity; the table's primary key name and columns; the
column's single-column unique constraint name, its single-column CHECK (name and expression), and
its single-column foreign keys (name, target, actions). Multi-column constraints are not this
panel's to edit, and it says so when one exists.

`lib/column-statements.ts` (+ test) builds from `before` (null when adding) and `after`:

- **Add**: `add column` with type, identity, default, not null, unique and check inline; then the
  primary key; then each foreign key; then the comment.
- **Edit**: one `alter table` whose parts are atomic together — type, identity, default,
  nullability, unique, check, primary key, foreign keys — then the comment, then the rename last.
- **Primary key** on a table that already has one is `drop constraint`, `add primary key` with the
  new set, in the same `alter table`.
- **Default**, as the original words it: a value in brackets is an expression and runs as written;
  anything else is a literal and is quoted. The statement is shown before it runs either way.
- CHECK is SQL by nature, and is labelled so.

Gate: on ZKVault, a table with rows; every kind of change, alone and together; one statement that
fails part-way, to confirm nothing of it lands. Restore.

## Phase 2 — the panel

Header *Update column `x` from `table`* / *Add new column to `table`*. Label and help on the left,
fields on the right, as the original's sections. Footer Cancel / Save; Delete column stays on the
left of the footer, because the Table Editor's grid has no other way to drop one.

## Phase 3 — foreign keys

Each existing key as a row — `→ schema.table.column`, its actions, remove. *Add foreign key* opens
a dialog: schema, table, column (from the parts the Table Editor already reads), on update, on
delete. Saved with the rest of the panel, not on its own.

## Success criteria

- [x] Changing one field sends one clause; the preview is what the server runs.
- [x] Toggling primary key on a table with a composite key keeps the other columns in it.
- [x] A statement failing part-way leaves the column exactly as it was (measured).
- [x] Add and edit open the same panel in the Table Editor and in Database › Tables.
- [ ] A foreign key added from the dialog appears as a Foreign key token on the columns page.

## Built 2026-09-26

Every kind of change was run on ZKVault through the app's own builders and dropped after — see
`docs/table-editor.md`. Two things the plan did not foresee: an identity needs `not null` first, and
a new identity's sequence starts under the existing values; both are handled in the builder now.
The real facts of `connection_events.user_id` on SuperDB (read only) — default `(auth.uid())`, a key
to `auth.users.id` on delete cascade — were drawn in a throwaway route and compared with the
original's screenshot.

Replaced and deleted: `add-column-sheet.tsx`, `column-edit-sheet.tsx`, `column-edit-fields.tsx`, and
the `addColumn` / `alterColumn` builders, actions and tests they alone used. `DropWarning` moved to
its own file. **Not clicked:** Save, Delete column and the foreign key dialog, signed in.
