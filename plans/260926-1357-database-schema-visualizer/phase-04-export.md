---
phase: 4
title: "Copy and download"
status: pending
priority: P2
effort: "3h"
dependencies: [3]
---

# Phase 4: Copy and download

## Requirements

- **Copy as SQL** — the schema's tables, from the catalog: `lib/table-ddl.ts` already rebuilds
  `CREATE TABLE` with constraints, indexes and policies. It gains a schema-wide form in one
  statement, because this endpoint returns only the last result set.
- **Copy as Markdown** — the original's format: a heading per table, then a Name / Type /
  Constraints table. Pure, tested, escaping `|` and backticks.
- **Download as PNG / SVG** — `html-to-image` on the viewport, as the original does, with node menus
  hidden while it renders.
- Per table: the same SQL and Markdown for that table alone.

## Success Criteria

- [ ] The SQL copied for one table equals the Table Editor's definition of it.
- [ ] Markdown for a name containing `|` stays a valid table.
- [ ] PNG and SVG download and open.
