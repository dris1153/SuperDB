---
phase: 2
title: "Read path"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Read path

## Overview

Makes the board render in the user's saved project order, and adds the server actions that write and
clear it.

## Requirements

**Functional**
- Projects render in `sort_order` when the user has one.
- A project with no row sorts last, not first.
- With no saved order at all, the board looks exactly as it does today.
- The reorder action validates refs before writing.

**Non-functional**
- The extra query runs in parallel with the Management API fan-out, not after it.
- A failure reading the order degrades to connection order rather than failing the page.

## Architecture

`loadInventory` already fans out per connection inside `Promise.all`. The order map joins that same
call, so it costs no extra wall-clock time:

```ts
const [connections, order] = await Promise.all([connectionsWithTokens(), projectOrder()]);
```

Then, after the existing per-connection grouping:

```ts
// Saved order wins; anything unplaced keeps the connection grouping and falls after it. A project
// created upstream since the last reorder therefore appears at the end rather than at the top.
const placed = (p: InventoryProject) => order.get(p.ref) ?? Number.MAX_SAFE_INTEGER;
return projects.sort((a, b) => placed(a) - placed(b));
```

`Array.prototype.sort` is stable, so projects sharing `MAX_SAFE_INTEGER` keep the connection order
computed above them. That is the whole tie-break; nothing else is needed.

**Degrade rather than fail.** If the order select errors, return an empty map. The board is still
useful in connection order, and taking the page down because a preference could not be read would be
a poor trade. This differs from `connectionsWithTokens`, which must throw — without tokens there is
nothing to show at all.

**Actions.** `reorderProjects(refs)` and `resetProjectOrder()` live in `lib/connections.ts`'s
neighbourhood — a new `lib/project-order.ts` is cleaner, since this is not about connections.
Validate with the existing `isProjectRef` from `lib/inventory.ts` (`/^[a-z]{20}$/`) and cap the array
length, the same shape as `reorderConnections`.

Both revalidate `/` only. `/connections` does not render project order.

## Related Code Files

- Create: `lib/project-order.ts` — read helper plus both server actions
- Modify: `lib/inventory.ts` — `loadInventory` takes the order into account
- Read for context: `lib/connections.ts::reorderConnections` for the validation shape,
  `lib/inventory.ts::isProjectRef`

## Implementation Steps

1. Write the read helper: select `project_ref, sort_order` for the current user into a `Map`.
   Swallow the error into an empty map, with a comment saying why this one degrades.
2. Add it to `loadInventory`'s existing `Promise.all`.
3. Apply the sort after the per-connection grouping, with the comment above.
4. Write `reorderProjects` and `resetProjectOrder`, validating refs and capping the length.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`.
6. Verify by hand: insert an order directly in SQL, load `/`, confirm the board follows it.
7. Clear the rows, reload, confirm the board is back to connection order.

## Success Criteria

- [ ] With rows present, the board renders in `sort_order`.
- [ ] With no rows, the board is byte-identical to today's output.
- [ ] A ref with no row sorts last.
- [ ] Projects with no row keep connection order among themselves.
- [ ] A deliberately broken order query leaves the board working in connection order.
- [ ] `reorderProjects` refuses a malformed ref and an oversized array.
- [ ] `pnpm test` still 285/285.

## Risk Assessment

**The extra query lands on the board's critical path.** It is small, indexed by primary key and
parallel — but it is one more round trip on the screen an entire plan was written to speed up, and
that plan's baseline was never measured. Note the timing when the latency work resumes.

**Nulls sorting first.** An unplaced project jumping to the top of the board is the most visible
possible wrong answer. `MAX_SAFE_INTEGER` rather than `0` or `null`, and it is a success criterion.

**Swallowing the error hides a real fault.** A permanently broken order query would look like "drag
does not stick" with nothing in the UI to explain it. Acceptable for a preference, but the swallow
needs a comment so the next reader knows it is deliberate.

**Merge conflict with navigation-latency phase 6.** Both edit `lib/inventory.ts`. Whichever lands
second resolves it.
