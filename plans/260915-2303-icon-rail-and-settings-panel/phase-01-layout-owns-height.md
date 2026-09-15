---
phase: 1
title: "The layout owns the height"
status: in-progress  # code done; every criterion needs the app
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: The layout owns the height

## Overview

Three files claim the full viewport for themselves. The topbar in phase 3 makes that claim false, so
it is corrected first — while the only thing that can have broken is this change.

## Why this is its own phase

`components/sql-editor/workspace.tsx:75` and `components/table-editor/editor.tsx:140` are `h-screen`,
and `app/(app)/p/[ref]/tables/loading.tsx:9` matches them. Put a 40px bar above and each page becomes
`100vh + 40px`:

- the whole app grows a vertical scrollbar it never had, and
- the grid and the editor compute their own scroll areas from a height that is now 40px too large.

The second is the one that matters. `react-data-grid` virtualises against its container, and
CodeMirror sizes its scroller the same way; both are wrong by exactly the bar's height, and the
symptom appears at the *bottom of a long result* rather than on the screen where the edit was made.
Landing this with a new component in the same commit means the bug and its cause look unrelated.

## Requirements

- `app/(app)/p/[ref]/layout.tsx` sets the height for everything beneath it.
- The two editors and the tables loading state fill what they are given rather than naming a height.
- Nothing scrolls vertically that did not before, and neither editor's inner scroll region changes.

## Architecture

The project layout becomes a column that owns `h-dvh`, with the content area `min-h-0 flex-1`.
`min-h-0` is not optional: a flex child defaults to `min-height: auto`, so without it the editors
refuse to shrink and push the page taller — the same overflow by a different route.

`h-dvh` rather than `h-screen`: on mobile browsers `100vh` includes the retracting address bar, so a
full-height editor is taller than the visible area for as long as the bar is showing.

**Keep `data-content-area`.** The usage carousel measures that element to decide how far it may bleed
sideways (`components/service-carousel.tsx`). Moving it or dropping it changes the carousel with no
error anywhere.

## Related Code Files

- Modify: `app/(app)/p/[ref]/layout.tsx`, `components/sql-editor/workspace.tsx`,
  `components/table-editor/editor.tsx`, `app/(app)/p/[ref]/tables/loading.tsx`
- Read for context: `components/service-carousel.tsx` for what measures the content area

## Implementation Steps

1. Layout owns the height; content area keeps `data-content-area` and gains `min-h-0 flex-1`.
2. Both editors and the tables loading state switch to `h-full`.
3. Scroll to the bottom of a table with more rows than fit, and to the bottom of a long query result.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## What landed

- `app/(app)/p/[ref]/layout.tsx` — `flex h-dvh`, content area `min-h-0 min-w-0 flex-1 overflow-y-auto`,
  `data-content-area` kept where the carousel expects it.
- `components/sql-editor/workspace.tsx`, `components/table-editor/editor.tsx`,
  `app/(app)/p/[ref]/tables/loading.tsx` — `h-screen` to `h-full`.

`h-screen` now appears nowhere outside a comment explaining why.

The scroll moves from the document to the content area, which is what lets the rail and a future
topbar stay put while a long overview scrolls beside them.

## Success Criteria

- [ ] **Needs the app.** No project page scrolls vertically at the document level.
- [ ] **Needs the app.** The grid reaches its last row, and the SQL result grid reaches its last row.
- [ ] **Needs the app.** The usage carousel still bleeds the same distance past its container.
- [ ] **Needs the app.** The tables loading state is the same height as the editor that replaces it.
- [x] `pnpm test` still green — 410, **and none of them touch this**. The suite is `lib` only with no
      DOM harness, so this row is the absence of a regression elsewhere, not evidence about this
      phase.

## Risk Assessment

**A flex child that will not shrink.** Without `min-h-0` the editors overflow instead of scrolling,
which looks like the change did nothing until the page is scrolled.

**Nothing in the test suite reaches this.** The suite is `lib/**/*.test.ts` with no DOM harness, so
every criterion here is a manual check. Saying "tests green" about this phase would be saying nothing.
