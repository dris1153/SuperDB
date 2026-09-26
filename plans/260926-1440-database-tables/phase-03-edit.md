---
phase: 3
title: "Edit table"
status: in-progress  # statements measured; sheet unclicked
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 3: Edit table

## Requirements

A sheet with the original's table fields: name, description, *Enable Row Level Security*, *Enable
Realtime*. Save shows the statement first — the Table Editor's DDL confirm — and runs only what
changed.

## Architecture

- Pure builders in `lib/ddl-statements.ts` (+ test): `comment on table`, `alter table … rename to`,
  `alter publication supabase_realtime add|drop table`. RLS reuses `setRls`.
- One string, rename **last** so every earlier statement can name the table as it was.
- `editTable` in `lib/ddl-actions.ts` through `run`: the server rebuilds from the inputs.

## Gate

Measure on ZKVault: the realtime statements through the write endpoint, and a rename + comment in
one string. Restore.

## Success Criteria

- [x] Changing only the description sends only `comment on table`.
- [x] A rename is last in the statement (tested; measured on ZKVault), and the list shows the new name after.
- [x] Realtime toggles the publication and the list's column follows.
