---
phase: 4
title: "Ordering UI"
status: pending
priority: P2
effort: "4h"
dependencies: [2, 3]
---

# Phase 4: Ordering UI

## Overview

Drag-and-drop reordering in the connections table, plus sortable columns, with the two modes kept
from fighting each other.

The only phase that adds a dependency, and the only one that is optional — Phases 1–3 already give a
working, controllable order.

## Gate before starting

**Re-check that column sort is still wanted.** With four connections and a manual order in place, it
may be redundant, and it is the half of this phase that creates the conflict below. If it is dropped,
this phase loses its hardest problem. Ask before building it.

## Requirements

**Functional**
- Dragging a row to a new position persists it.
- Owner, Kind, Account and Added sort on click. Tags and Token do not — neither sorts meaningfully.
- Sort state lives in the URL.
- While a column sort is active, dragging is disabled and the UI says why.
- Clearing the sort restores the manual order.

**Non-functional**
- Reordering works by keyboard and on touch, or the library choice was wrong.
- The connections page stays a server component; only the table body becomes a client island.

## The conflict, and the resolution

Manual order and column sort cannot both be live. Sorted by Owner A→Z, dragging row three to the top
has no correct `sort_order` to write — any answer is a guess about intent.

Resolution, matching Linear, Notion and Jira: **manual order is the default view. Applying a column
sort overrides it and disables dragging**, with a visible affordance:

> Sorted by Owner · **Clear to reorder**

The failure mode being designed out is the silent one: a user drags, the row snaps back, and nothing
explains why. Disabled handles plus a sentence is the whole fix.

## Architecture

**Sort state on the URL** (`?sort=owner.asc`), matching the table editor's wire format in
`lib/table-view.ts`. The page is a server component and the URL is already where "what data is shown"
lives in this codebase. Reuse the *convention*, not the code — `parseSort` there takes column metadata
this table does not have.

Sorting is applied server-side in `app/(app)/connections/page.tsx` after `listConnections()`. The list
is tiny; there is no reason to push it to the client.

**Drag as a client island.** The table body becomes a client component receiving the ordered
connections and the `reorder` action from Phase 3. Everything else on the page stays server-rendered.
On drop: reorder locally for immediate feedback, call the action, and let `revalidatePath` settle the
truth. If the call fails, restore the previous order and surface the error — do not leave the optimistic
order on screen.

Note this is the one place the codebase uses optimistic UI; the table editor deliberately does not
(`components/table-editor/grid.tsx` round-trips every write). Reordering is different — a
round-trip per drag feels broken — but say so in a comment, because it reads as an inconsistency.

**Library choice — verify at install time.**

`react-beautiful-dnd` was archived by Atlassian. `dnd-kit` is the usual replacement. **Do not take
either statement, or anything in the brainstorm report, as current.** Check the repository's recent
activity, the latest major version, and React 19 compatibility before adding it. This session already
produced one wrong conclusion from an unverified assumption about a library's internals; see
[`docs/journals/260910-misreading-a-branch.md`](../../docs/journals/260910-misreading-a-branch.md).

If the chosen library turns out unmaintained or React 19-incompatible, **fall back to up/down arrow
buttons** rather than hand-rolling HTML5 drag events: those break on touch and for keyboard users, and
this codebase is careful about both.

## Recorded trade-off

Arrow buttons were recommended — zero dependency, touch and keyboard for free, roughly twenty lines,
against four rows of data. The user chose drag. Proceeding with drag; recorded so the cost stays
visible if the dependency later feels heavy.

## Related Code Files

- Create: a client component for the sortable table body under `components/`
- Modify: `app/(app)/connections/page.tsx`, `package.json`
- Read for context: `components/table-editor/grid.tsx` (the no-optimistic-UI rule this deviates from),
  `lib/table-view.ts` (the sort wire format)

## Implementation Steps

1. Confirm the gate above: is column sort still wanted?
2. Verify and add the drag library. Record the version and why it was chosen.
3. Extract the table body into a client component that renders the current order.
4. Wire drag to the Phase 3 action, with optimistic reorder and rollback on failure.
5. Add server-side column sorting driven by `?sort=`.
6. Disable drag handles while sorted; add the "Sorted by X · Clear to reorder" affordance.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
8. Test with a keyboard alone, and on a touch device.

## Success Criteria

- [ ] Drag to a new position, reload — the order persisted.
- [ ] The board follows the same order.
- [ ] Sorting by a column disables dragging and shows the affordance.
- [ ] Clearing the sort restores the manual order.
- [ ] Reordering is possible with the keyboard alone.
- [ ] Reordering works on a touch device.
- [ ] A failed reorder rolls back the optimistic order and shows the error.
- [ ] The library's version and maintenance status were checked, not assumed, and recorded.
- [ ] `pnpm test` still 262/262; `pnpm build` clean.

## Risk Assessment

**Silent snap-back.** The whole reason the disabled state and affordance are requirements rather than
polish.

**An unmaintained dependency.** Mitigated by the verification step and the arrow-button fallback.
The fallback is not a lesser outcome; it was the original recommendation.

**Optimistic UI hiding a failure.** If the action fails and the row stays where it was dropped, the
user believes an order that is not stored. Rollback plus a visible error is a success criterion.

**Accessibility regression.** Drag is the least accessible interaction in the app so far. If the
library does not give keyboard reordering, the phase is not done — that is what the criterion is for.

**Scope creep into the board.** Making the board draggable too is out of scope. If the flat project
list looks arbitrary once ordering lands, that is a separate conversation about grouping projects
under a connection heading.
