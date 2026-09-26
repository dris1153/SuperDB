---
phase: 1
title: "The list"
status: in-progress  # rendered from real data; interactions unclicked
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: The list

## Requirements

- Header *Database Tables*. Toolbar: schema select, *Search for a table*, *Entity Type* popover
  (Table, View, Materialized view, Foreign table, Partitioned table — checkbox each, *Select only*
  on hover), *New table* on the right.
- Columns: entity icon, Name (comment beneath), Columns, Rows (estimated), Size (estimated),
  Realtime (✓ Enabled / ✕ Disabled), then *View columns* and ⋮.
- Footer: `8 tables`. Empty and no-match states.
- Search and entity filter in the browser — one schema arrives whole.

## Architecture

- Part `schema-entities` (`?schema=`), uncached, from the measured statement.
- Pure `lib/table-entities.ts` (+ test): parse, filter, the count sentence.
- Replaces `/database/tables` and `components/project-database/tables-card.tsx`; the `tables` part
  goes too if nothing else reads it.

## Success Criteria

- [x] SuperDB `public` shows the eight rows with the measured numbers.
- [ ] Unticking *Table* empties the list and says why; *Select only* leaves one type.
- [ ] Delete asks for the name and is audited, as in the Table Editor.
