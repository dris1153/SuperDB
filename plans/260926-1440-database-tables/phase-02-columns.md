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

## Redone against a screenshot of the original, 2026-09-26

The first version drew the data and missed the page. Now as the original has it: the table name
alone as the title, a type-family icon per row (from the original's own type list — `uuid` is
text), the two-part mono constraint tokens with *Primary* in green, *New column*, and *Edit* plus
⋮ › *Delete column* on each row, and a `9 columns` footer. The writes are the Table Editor's
own: its add and edit sheets, and its drop confirm with the count of rows that hold a value.
Offered only on an ordinary or partitioned table — the read now carries the relation's kind.

Rendered from SuperDB's real `connection_events` in a throwaway route and compared with the
screenshot; the sheets and confirms are unclicked.
