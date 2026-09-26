---
phase: 2
title: "A table's columns"
status: pending
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

The `columns` part the Table Editor already reads (`describeTable`) carries what this needs; the
page only draws it.

## Success Criteria

- [ ] `public.connections` lists its 17 columns with the right constraints.
- [ ] A table that does not exist answers 404.
