---
type: brainstorm-report
date: 2026-09-11
scope: manual drag ordering for the project cards
branch: perf/navigation-latency
head: 980f467
---

# Manual drag ordering for project cards

## Problem statement

Asked for: drag-to-reorder on the board's project cards, in addition to the field sort shipped in
[260911-0039](./260911-0039-project-card-sorting-brainstorm.md).

That earlier report recommended *against* this and the user accepted field sort at the time. They have
now asked for drag twice. **The cost was stated, the decision is theirs, and this report designs it
rather than re-arguing it.** What follows treats the three objections raised then as problems to
solve.

## The three objections, now requirements

**A place to persist.** Projects come from the Management API, so there is no row to add a column to.
A new table, keyed by the ref.

**Rows orphaned upstream.** A project deleted in Supabase leaves a row keyed by a ref that never
matches again. It is inert — a few bytes, never read. **No reaper.** Building one would mean deciding
that a ref absent from one API response is gone for good, which a failed call also looks like.

**Dragging in a reflowing grid.** Solvable: DOM order matches visual order in a grid flow, so the
hitbox uses `allowedEdges: ['left', 'right']` with `axis: 'horizontal'`. `reorderWithEdge` accepts
`horizontal` — read from its type while building the connections drag.

## Decisions settled with the user

| Question | Decision |
|---|---|
| Scope of the order | **Global.** Any card anywhere |
| Relationship to "Connection order" | **Replaces it as the default.** Relabelled "My order", plus a reset |
| While filtered, searched or sorted | **Drag disabled**, with an explanation |
| Connection group headings | **None** |

### Why no headings, after they were initially wanted

Global drag and group headings contradict each other: free movement interleaves connections, and a
heading assumes its cards are contiguous. Three coherent readings existed — repeat the heading at
every run boundary, show headings only in connection-order mode, or drop them.

Dropped, because **the card already carries its connection**: `ProjectCard` prints the owner with a
lock icon and `orgName · region`. A heading would restate on-screen information in a second place.
That also closes the "should the board group by connection" question left open across three reports.

## Design

### Schema

```sql
create table if not exists public.project_order (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_ref  text not null,
  sort_order   integer not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, project_ref)
);
```

The composite primary key doubles as the `on conflict` target, so no surrogate id. RLS
`user_id = auth.uid()`, `revoke all from anon`, matching the four tables beside it.

**No backfill, and that matters.** The table starts empty; the first drag sends the whole visible
order, seeding every row at once. The `connections` backfill had to exist because rows were already
there — and that backfill is exactly where a bug shipped yesterday, caught only in review. This
design has no equivalent surface.

### Writing the order

```sql
insert into public.project_order (user_id, project_ref, sort_order)
select auth.uid(), r.ref, r.ord
  from unnest(refs) with ordinality as r(ref, ord)
on conflict (user_id, project_ref) do update
  set sort_order = excluded.sort_order, updated_at = now();
```

One statement, so a partial reorder cannot exist. `with ordinality` supplies the position for free.
`security invoker`, like `reorder_connections`: the RLS policy already scopes it and elevation would
only widen what a bug could reach.

Reset is a delete of the user's own rows, returning the board to connection order.

### Reading

`loadInventory` gains a select of the user's order map, run inside the existing `Promise.all` beside
the Management API fan-out. Projects sort by `sort_order` with nulls last, tie-broken by the current
connection-grouped order, so a project created upstream since the last reorder lands at the end.

### Share the state machine, do not copy it

`components/sortable-connections.tsx` already holds an optimistic order, a `pending` gate on the
render-phase sync, and a rollback that re-fetches rather than restoring a snapshot. **Those three
things are precisely the two HIGH defects review found yesterday.** Writing a second copy would very
likely reproduce them.

Extract the state machine as a hook — optimistic order, commit, rollback, pending — and leave the DOM
and drag wiring separate, since a vertical table and a horizontal grid differ there. Two consumers is
the point at which this stops being speculative.

## Risks

| Risk | Mitigation |
|---|---|
| Re-implementing the two HIGH bugs from the connections drag | The shared hook above; this is its main justification |
| `ProjectCard` must be restructured | Real work, not a tweak — see below |
| An extra query in `loadInventory` | Small, indexed, parallel — but it runs against the latency work; measure |
| Conflicts with navigation-latency phase 6 | Both edit `lib/inventory.ts`; whichever lands second resolves it |
| Drag only available in a clean view | Explicit affordance; unavoidable given five controls |
| Orphaned rows accumulate | Accepted, inert, documented. No reaper |
| A ref arrives that is not a project ref | Validate with the existing `isProjectRef` before writing |

### The card restructure is the hidden cost

Drag is not keyboard-operable — established while building the connections table, which is why it has
up/down buttons. The same applies here, but `ProjectCard` is a `<Link>` wrapping the whole card, and
**a button inside a link is invalid HTML**. The link must shrink to the card's content and the move
buttons must sit beside it inside the card.

This is the part most likely to be underestimated: it changes the markup of the board's main element,
which affects hover, focus and the existing click target.

## Success metrics

- Drag a card, reload — the order persists.
- The first drag seeds every project, not only the dragged one.
- A project created upstream since the last reorder appears last, not first.
- Deleting a project upstream does not disturb the order of the rest.
- Drag is disabled whenever any filter, search or sort is active, and says why.
- Reset returns the board to connection order.
- Reordering is possible with the keyboard alone.
- The optimistic order is never left on screen after a failed write.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green (285 tests today).

## Next steps

Large enough to warrant a plan: a schema change, an RPC, a read-path change, a shared-hook
refactor of shipped code, and a markup restructure of the board's main component.

Suggested phases: schema and RPC · read path · shared hook extracted from the connections drag ·
card restructure and grid drag.

Phase 3 is worth doing carefully — it touches code that is already shipped and already reviewed.

## Open questions

- Whether the reset belongs in the sort Select or as a separate control; decide when the UI is in
  front of you.
- Whether the extra `loadInventory` query is measurable against the outstanding latency baseline that
  has still not been captured.
