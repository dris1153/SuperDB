---
phase: 3
title: "The canvas"
status: in-progress  # drawn from real data; interactions unclicked
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
computed from row count. ~~The canvas is loaded with `next/dynamic`~~ — not needed: a client
component imported by one page lands in that route's chunks only, and the build confirmed it (the
xyflow chunk is in the schemas page's manifest and no other). Nothing renders before the part
arrives in the browser, so there is no server render of the canvas to avoid either.

## Success Criteria

- [x] The SuperDB `public` schema draws its 8 tables and 9 relationships, `auth.users.id` once.
- [ ] Dragging a node survives a reload; Auto layout undoes that after confirming.
- [x] Other routes' first-load JS unchanged — measured after the build.
