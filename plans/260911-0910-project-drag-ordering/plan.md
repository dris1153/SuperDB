---
title: "Project drag ordering"
status: completed
created: 2026-09-11
blockedBy: [260910-0934-connection-ordering]
blocks: []
---

# Project drag ordering

Drag-to-reorder for the board's project cards, persisted per user. The order is global — any card
anywhere — and becomes the board's default view, replacing the connection order shipped in
[260910-0934](../260910-0934-connection-ordering/plan.md).

Design, the objections it had to answer, and why there are no group headings:
[260911-0906-project-drag-ordering-brainstorm.md](../reports/260911-0906-project-drag-ordering-brainstorm.md).
**Read it before starting.**

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Schema and RPC](phase-01-schema-and-rpc.md) | pending | ~2h | — |
| 2 | [Read path](phase-02-read-path.md) | pending | ~1h | 1 |
| 3 | [Shared order hook](phase-03-shared-order-hook.md) | pending | ~2h | — |
| 4 | [Card restructure and grid drag](phase-04-card-and-grid-drag.md) | pending | ~5h | 2, 3 |

Phase 3 is independent of 1 and 2 and can be done first; it refactors already-shipped code and is
worth landing on its own so a regression there is not tangled up with new behaviour.

## Run the SQL before deploying anything

**Applied 2026-09-11.** `supabase/schema.sql` has been run against the live database, covering both
this plan's objects and `connections.sort_order` from the previous one.

The rule still holds for any future change to that file: run it before deploying code that reads the
new objects. `connectionsWithTokens` feeds `resolveProject`, which gates every project page and every
write, DDL and connect action, and the repo has no `error.tsx` — so a missing column is a 500 across
the app, not a degraded board.

**The `reorder_projects` body changed after that run** (duplicate refs; see phase 1), so the file
needs re-running once more before dragging works.

## Settled decisions

Do not re-open these during implementation:

- **The order is global.** Cards from different connections may interleave.
- **No group headings.** Global drag and headings contradict each other, and the card already prints
  its owner and organization — a heading would restate what is on screen. This also closes the
  "group the board by connection" question left open across three reports.
- **No backfill.** The table starts empty and the first drag seeds every row at once. This is why
  the design has no equivalent of the `connections` backfill defect found in review yesterday.
- **No reaper for orphaned rows.** A project deleted upstream leaves an inert row. Collecting it
  would mean treating a ref absent from one API response as gone for good — which a failed call also
  looks like.
- **Drag only in a clean view.** Any filter, search or sort disables it, with an explanation. With
  five controls this state will be common; that is the accepted cost of an unambiguous drop target.

## Recorded decision history

Manual drag was recommended against in
[260911-0039](../reports/260911-0039-project-card-sorting-brainstorm.md) and field sort was built
instead. The user asked for drag twice after that. The cost is recorded in both reports; this plan
builds what was asked for.

## Cross-plan notes

**[260910-0934-connection-ordering](../260910-0934-connection-ordering/plan.md)** — phase 3 here
refactors `components/sortable-connections.tsx`, which that plan's phase 4 produced. Marked
`blockedBy` because the refactor needs that code to be settled first, and its manual verification is
still unrun. Do not refactor a component whose behaviour has never been confirmed by hand.

**[260910-0042-navigation-latency](../260910-0042-navigation-latency/plan.md)** — phase 6 there also
edits `lib/inventory.ts`, where phase 2 here changes `loadInventory`. Neither blocks the other;
whichever lands second resolves a conflict. That phase is P3 and deferred.

## Success metrics

- Drag a card, reload — the order persists.
- The first drag seeds every project, not only the one moved.
- A project created upstream since the last reorder appears last, not first.
- Deleting a project upstream leaves the rest in order.
- Drag is disabled whenever any filter, search or sort is active, and says why.
- Reset returns the board to connection order.
- Reordering is possible with the keyboard alone.
- No optimistic order is ever left on screen after a failed write.
- **The connections drag behaves identically after phase 3.**
- `pnpm test` (285 today), `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green.

## Closed 2026-09-26

Verified in the code: `reorder_projects(text[])` is in `supabase/schema.sql`, `lib/project-order.ts`
calls it, and `components/sortable-projects.tsx` shares
`components/use-optimistic-order.ts` with the connections board — which is the second of the two
locations phase 3 offered, and why an audit looking only for `lib/use-optimistic-order.ts` reported
it missing.
