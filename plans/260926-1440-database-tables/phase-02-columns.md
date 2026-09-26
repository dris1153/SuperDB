---
phase: 2
title: "A table's columns"
status: in-progress  # rendered from real data
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 2: A table's columns

## Requirements

- `/database/tables/[table]?schema=`: breadcrumb back to Tables, the table's name, *Filter columns*.
- Columns Name (comment beneath), Type, Constraints — primary key, nullable, unique, identity,
  default — read only.
- An unknown table is a 404, checked against the catalog, never quoted blind.

## Architecture

~~The `columns` part the Table Editor already reads (`describeTable`) carries what this needs.~~ It
does not: no comment, no unique or identity flag. A `table-columns` part reads them, with `found` so a
missing table can be told from an empty one.

## Success Criteria

- [x] `public.connections` lists its 17 columns with the right constraints.
- [x] A table that does not exist says so — `found: false`, drawn as a message rather than a 404, because the check needs the project's catalog and the page shell does not read it.
