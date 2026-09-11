---
title: "Connection ordering: manual order plus column sort"
status: pending
created: 2026-09-10
blockedBy: []
blocks: [260911-0910-project-drag-ordering]
---

# Connection ordering

Connections render in `created_at` order with no way to change it. This gives the user a manual order
they control, drives the projects board from it, and adds sortable columns on top.

Design, the alternatives weighed, and the recommendation the user overrode:
[260910-0932-connection-ordering-brainstorm.md](../reports/260910-0932-connection-ordering-brainstorm.md).
**Read it before starting.**

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Schema](phase-01-schema.md) | pending | ~2h | — |
| 2 | [Read path](phase-02-read-path.md) | pending | ~1h | 1 |
| 3 | [Reorder action](phase-03-reorder-action.md) | pending | ~1h | 1 |
| 4 | [Ordering UI](phase-04-ordering-ui.md) | pending | ~4h | 2, 3 |

**Phases 1–3 are worth shipping alone.** They give a stable, controllable order — settable by hand in
SQL — before any drag UI exists, and they pull in no new dependency. Phase 4 is the only phase that
adds one.

> **Run `supabase/schema.sql` before deploying the Phase 2 code.** Phase 2 orders by a column Phase 1
> creates; against a table without it, `connectionsWithTokens` throws, and that function gates every
> project page and every write, DDL and connect action through `resolveProject`. With no `error.tsx`
> in the repo, each becomes a 500. Details and the sequence are in
> [phase-01](phase-01-schema.md#deploy-order--not-optional).

## Settled decisions

Do not re-open these during implementation:

- **Manual order is the default view; a column sort overrides it and disables dragging**, with a
  visible "Sorted by X — clear to reorder" affordance. The two cannot both be live: with the table
  sorted A→Z, dragging row three to the top has no correct `sort_order` to write. A silent snap-back
  is the failure mode being designed out.
- **The column is `sort_order`, not `position`.** `POSITION` is a standard SQL function name and
  reads ambiguously unquoted.
- **No unique constraint on `(user_id, sort_order)`.** Rewriting a whole ordering passes through
  transient duplicates that a constraint would reject.
- **Reordering goes through a Postgres function, not a loop of updates.** `rotateVault` already
  contains a non-atomic update loop, recorded as a defect in
  [the scout report](../reports/260910-0028-whole-project-scout.md). Repeating that shape knowingly
  would be worse than the first time.
- **`sort_order` is assigned on insert only**, so re-authorizing never reshuffles the list — the same
  rule that already protects `display_name` and `tags`.

## Recorded trade-off

Up/down arrow buttons were recommended over drag and drop: zero dependency, works on touch,
keyboard-accessible for free, roughly twenty lines, against four rows of data. **The user chose drag.**
Recorded so the cost stays visible if the dependency later feels heavy. Hand-rolled HTML5 drag was
considered and rejected — it breaks on touch and for keyboard users.

## Cross-plan note

[260910-0042-navigation-latency](../260910-0042-navigation-latency/plan.md) phase 6 also modifies
`lib/inventory.ts`, adding cached wrappers around the Management API calls. Phase 2 here changes
`loadInventory`'s sort in the same file. Not a logical dependency in either direction — but whichever
lands second should expect a merge conflict in that file. Nav-latency phase 6 is P3 and explicitly
deferred, so this plan will most likely land first.

`260824-1218-multi-user-auth-and-oauth-connections` phase 2 lists the same two files, but that work
shipped long ago; its `status: pending` is known stale frontmatter, not active work.

**Blocks [260911-0910-project-drag-ordering](../260911-0910-project-drag-ordering/plan.md).** Its
phase 3 refactors `components/sortable-connections.tsx`, produced by phase 4 here. **Run this plan's
manual checks before that refactor starts** — phase 4's code passed review and every static check,
but its blocking end-to-end verification is still unrun, and refactoring on an unverified baseline
makes any later bug ambiguous between the two plans.

## Success metrics

- Drag a connection to a new position, reload — the order persists.
- The board's project order follows the connection order.
- A column sort disables dragging and says so; clearing it restores the manual order.
- A newly connected account appears last; re-authorizing an existing one does not move it.
- Re-running `supabase/schema.sql` against a populated database is a no-op.
- `pnpm test` (262 today), `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green.
