---
phase: 2
title: "The catalog read"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 2: The catalog read

## Overview

One statement per schema, one part, and a pure module that turns its answer into the graph.

## Architecture

- **SQL** (server-only): measured in the plan. Tables are relkind `r`/`p`, partition children
  excluded. Flags per column: `nullable`, `identity`, `primary` (in the primary key), `unique` (a
  single-column unique constraint — the original's rule). Foreign keys unnested into column pairs,
  so a two-column key is two edges.
- **Part** `schema-graph`, `?schema=`, uncached — it is read on opening the page.
- **Pure** `lib/schema-graph.ts` (+ test): the part's JSON to nodes and edges. A foreign key into
  another schema becomes a label node `auth.users.id`, created once however many point at it.
  Handles are per column, ids stable across reads so saved positions still apply.

## Success Criteria

- [ ] A test pins nodes, edges and the one shared label node for a cross-schema key.
- [ ] A two-column foreign key yields two edges.
- [ ] Malformed input yields an empty graph, not a throw.
