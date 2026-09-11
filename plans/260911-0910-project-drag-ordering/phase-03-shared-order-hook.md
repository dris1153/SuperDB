---
phase: 3
title: "Shared order hook"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 3: Shared order hook

## Overview

Extracts the optimistic-ordering state machine out of `components/sortable-connections.tsx` so the
project grid can use it instead of growing a second copy.

Independent of phases 1 and 2. Worth landing on its own, so a regression here is not tangled up with
new behaviour.

## Why this phase exists

`sortable-connections.tsx` holds three things that took a review round to get right:

1. An optimistic order applied before the server confirms it.
2. A **gate on the render-phase sync**, so a revalidation mid-write does not undo the pending order
   and leave the next click computing from a stale list.
3. A **rollback that re-fetches** rather than restoring a snapshot, because anything held on the
   client may itself be an order that was never stored.

Points 2 and 3 are precisely the two HIGH defects code review found yesterday. Hand-writing them a
second time for the grid would very likely reproduce both. That is the entire justification for this
phase — not tidiness.

## Requirements

**Functional**
- The connections drag behaves **identically** after the extraction. That is the acceptance test.
- The hook exposes: the current order, a `commit(next)`, whether a write is pending, and the last
  error.
- It is agnostic about what it orders and how the DOM is wired.

**Non-functional**
- No behaviour change, no new dependency, no change to `sortable-connections.tsx`'s public props.

## Architecture

```ts
export function useOptimisticOrder<T extends { id: string }>(
  incoming: T[],
  write: (ids: string[]) => Promise<void>,
): {
  rows: T[];
  commit: (next: T[]) => void;
  pending: boolean;
  error: string | null;
};
```

Keyed on `id` so both callers fit: connections already use `id`, and the grid can map a project's
`ref` onto it.

What moves in: the two `useState`s, the render-phase sync with its `pending` gate, `commit` with its
no-op check and `useTransition`, and the `router.refresh()` rollback.

What stays out: `move(id, delta)` (list-position logic, trivial per caller), `monitorForElements`,
`draggable`, `dropTargetForElements`, edge state, and every class name. A vertical table and a
horizontal grid differ exactly there, and merging them would produce a component with a `variant`
prop — the abstraction this phase is trying not to build.

**Comments travel with the code.** The explanations on the sync gate and the rollback are the record
of two real defects. Moving the code without them would discard the reason.

## Related Code Files

- Create: `lib/use-optimistic-order.ts` (or `components/use-optimistic-order.ts` if the "use client"
  boundary makes that cleaner — decide when wiring it)
- Modify: `components/sortable-connections.tsx` — consume the hook, delete the moved code
- Read for context: the code review findings recorded in
  `../260910-0934-connection-ordering/phase-04-ordering-ui.md`

## Implementation Steps

1. Read `sortable-connections.tsx` in full before touching it. It is short, and the comments carry
   the reasoning.
2. Write the hook, moving the code verbatim where possible rather than rewriting it.
3. Rewire `sortable-connections.tsx`; delete what moved.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
5. **Verify the connections drag by hand** — see below. This is the phase's real gate.
6. Diff the hook against the original to confirm the sync gate and rollback survived unchanged.

## Success Criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; `pnpm test` still 285/285.
- [ ] Dragging a connection still reorders and persists.
- [ ] The up/down buttons still work and are still disabled at the ends.
- [ ] **Rapid clicking still does not swallow a move** — the defect the pending gate fixes.
- [ ] A failed write still does not leave the optimistic order on screen.
- [ ] Drag is still disabled while a column sort is active.
- [ ] The sync-gate and rollback comments moved with the code.
- [ ] `sortable-connections.tsx` got shorter, not longer.

## Risk Assessment

**Refactoring code whose behaviour was never confirmed by hand.** The connections drag passed review
and every static check, but its manual verification is still unrun. Refactoring on top of that means
a bug found later is ambiguous — original or introduced here? **Run the connections manual checks
before starting**, so there is a known-good baseline. This is why the plan marks itself `blockedBy`
that work.

**Dropping the gate or the rollback while moving them.** They are a few lines and look incidental.
Both are explicit success criteria, and the rapid-click check is the one that actually exercises the
gate.

**Over-abstracting.** A hook that also owns the drag wiring would need a `variant` prop and would be
worse than two copies. The boundary above is deliberate: state in the hook, DOM in the components.

**Generic key assumptions.** `T extends { id: string }` forces the grid to adapt projects to an `id`.
If that reads badly at the call site, change the hook's key accessor rather than reshaping the data.
