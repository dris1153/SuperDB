---
phase: 3
title: "Query tabs"
status: pending
priority: P2
effort: "1d"
dependencies: [1, 2]
---

# Phase 3: Query tabs

## Overview

The "+ New" tab bar: several queries open at once, each with its own buffer, surviving a reload.

## The part that needs care

Three state systems interact here, and getting the boundaries wrong is how this becomes hard to
reason about:

| State | Lives in | Lifetime |
|---|---|---|
| Which tabs are open | sessionStorage | the browser tab |
| What is saved | the database | forever |
| Unsaved buffer contents | sessionStorage | the browser tab |

**The table editor already solved this exact shape.** `components/table-editor/tab-bar.tsx` keeps
open tables per project under `superdb:tabs:{ref}`, and `session-store.ts` reads sessionStorage
through `useSyncExternalStore` with a manual listener set — because sessionStorage fires no event in
the tab that wrote it. Reuse both rather than inventing a second mechanism.

## Requirements

**Functional**
- Open several queries, switch between them, close them.
- A new tab starts empty; opening a saved query opens it in a tab.
- Unsaved edits survive a reload.
- A dirty tab is visibly dirty and warns before closing.

**Non-functional**
- No second sessionStorage abstraction. Reuse `session-store.ts`.

## Architecture

Keys follow the existing convention: `superdb:sql-tabs:{ref}` for the open list and
`superdb:sql-buffer:{tabId}` for contents. A tab references either a saved query id or nothing.

**A saved query renamed elsewhere** shows the name it has now, read from the saved list rather than
copied into tab state. Copying it is how two sources of truth start.

**A saved query deleted with a tab open** leaves the tab in place, holding its buffer, no longer
linked. Closing it is the user's decision, not a side effect of a delete somewhere else.

## Related Code Files

- Create: a tab bar component for this route
- Modify: the phase 1 route and editor, to work per tab
- Read for context: `components/table-editor/tab-bar.tsx`,
  `components/table-editor/session-store.ts`, and
  `components/table-editor/column-prefs.ts` for the key-naming convention and its stale-key filtering

## Implementation Steps

1. Read the table editor's tab bar and session store in full before writing anything.
2. Tab list state on the existing store, with convention-following keys.
3. Per-tab buffers; the editor reads and writes the active one.
4. Open-from-sidebar, new tab, close tab with a dirty warning.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
6. Verify: reload with three tabs open and unsaved edits in two of them.

## Success Criteria

- [ ] Several tabs open, switch and close correctly.
- [ ] Unsaved contents survive a reload, per tab.
- [ ] A dirty tab is marked and warns before closing.
- [ ] Renaming a saved query updates its tab label.
- [ ] Deleting a saved query leaves its tab and buffer intact.
- [ ] No second sessionStorage helper was added.
- [ ] Two browser tabs on the same project do not corrupt each other's lists.

## Risk Assessment

**A second session-store implementation.** The subtle part of the existing one is that sessionStorage
fires no event in the tab that wrote it, so it keeps a manual listener set. A fresh implementation
will miss that and appear to work until two components share a key.

**Unbounded buffer growth.** Tabs closed without cleanup leave orphaned buffer keys. Remove the key
on close and filter unknown keys on read — `column-prefs.ts` already does exactly this for stale
column names.

**Dirty state across a reload.** After a reload everything is technically unsaved. Compare against
the saved query's text to decide dirtiness, rather than tracking a flag that a reload resets.
