---
phase: 3
title: "The canvas"
status: pending
priority: P2
effort: "5h"
dependencies: [1, 2]
---

# Phase 3: The canvas

## Requirements

- Toolbar: schema select, Find table (focuses and centres the node), Copy as SQL split button (phase
  4 fills it), Auto layout behind a confirm.
- Node: header with table icon, name, ⋮ menu; rows with Primary key / Identity / Unique / Nullable
  icons, name, type. A label node for a cross-schema target.
- Edges: smooth-step, source column to target column.
- Dotted background, minimap, the legend bar along the bottom.
- Positions saved on drag, per project and schema, in `localStorage`; new tables placed without
  disturbing saved ones; Auto layout re-runs dagre and clears the saved set.
- Empty schema: "No tables in schema" and a link to the Table Editor.

## Architecture

`dagre` with the original's settings — `rankdir: LR`, `nodesep: 25`, `ranksep: 50` — on node sizes
computed from row count. The canvas is a client component loaded with `next/dynamic`, so neither
library reaches another route.

## Success Criteria

- [ ] The SuperDB `public` schema draws its 8 tables and 9 relationships, `auth.users.id` once.
- [ ] Dragging a node survives a reload; Auto layout undoes that after confirming.
- [ ] Other routes' first-load JS unchanged — measured after the build.
