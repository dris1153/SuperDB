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

Makes every read honour `sort_order`, including the board — which is where the ordering earns its
keep — and assigns a `sort_order` to newly connected accounts.

## Requirements

**Functional**
- The connections table renders in `sort_order`.
- Board projects appear grouped by connection, in the user's connection order.
- A newly connected account lands last.
- Re-authorizing an existing connection does not move it.

**Non-functional**
- No change to what data is fetched, only its order — so nothing here can affect the Management API
  fan-out or its error handling.

## Architecture

**Ordering the reads.** `lib/connections.ts` has two readers; both currently `.order("created_at")`:

- `listConnections()` — feeds the connections table.
- `connectionsWithTokens()` — feeds `loadInventory`, and therefore the board.

Both become `.order("sort_order")`. If Phase 1 left the column nullable, add
`{ nullsFirst: false }` so an unassigned row sorts last rather than first.

**The board.** `lib/inventory.ts::loadInventory` currently flattens then sorts globally:

```ts
.sort((a, b) =>
  a.owner.localeCompare(b.owner) || a.orgName.localeCompare(b.orgName) || a.name.localeCompare(b.name))
```

`perConnection` is already built by mapping over `connections` in their fetched order, and `.flat()`
preserves that. So the fix is to stop sorting across connections and sort only *within* one:

```ts
const projects = perConnection.flatMap((group) =>
  group.sort((a, b) => a.orgName.localeCompare(b.orgName) || a.name.localeCompare(b.name)));
```

This is a **visible behaviour change**: projects were alphabetical by owner and will now follow the
user's connection order. Intended, and stated up front in the brainstorm.

**New connections.** `lib/connections.ts::write` is select-then-update-or-insert. `sort_order` goes in
the **insert branch only**, exactly like `display_name` and `tags`, so re-authorizing never reshuffles.

Read the current maximum for this user and add one. A second connect racing this would collide on the
number; harmless, since nothing enforces uniqueness and the user can re-drag. Do not add a constraint
to "fix" it — see the plan's settled decisions.

## Related Code Files

- Modify: `lib/connections.ts` (`listConnections`, `connectionsWithTokens`, `write`),
  `lib/inventory.ts` (`loadInventory`)
- Read for context: `components/projects-board.tsx` — confirms the client only filters and never
  re-sorts, so the server order reaches the screen intact

## Implementation Steps

1. Point both readers at `sort_order`, handling nulls per Phase 1's decision.
2. Replace `loadInventory`'s global sort with the per-group sort above. Keep the comment explaining
   why the ordering is not alphabetical any more — a future reader will otherwise "fix" it back.
3. Add `sort_order` to `write`'s insert branch, with a one-line note that it is insert-only for the
   same reason `display_name` is.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`.
5. Verify by hand: set a custom order in SQL, reload `/connections` and `/`, confirm both follow it.
6. Connect a new account and confirm it appears last on both screens.

## Success Criteria

- [ ] `/connections` renders in `sort_order`.
- [ ] `/` groups projects by connection, in `sort_order`, alphabetical within each.
- [ ] A newly connected account appears last on both screens.
- [ ] Re-authorizing an existing connection leaves its position unchanged.
- [ ] A connection whose token is broken still degrades into `errors[]` rather than failing the page —
      the fan-out's error handling is untouched.
- [ ] `pnpm test` still 262/262.

## Risk Assessment

**Someone restores the alphabetical sort later.** It looks like a bug without context. Mitigation: the
comment in step 2, and this phase file.

**Nulls sorting first.** A row missed by the backfill would jump to the top of the board — the most
visible possible place. Mitigation: the `nullsFirst: false` decision, and the Phase 1 criterion that
no row is left null.

**A project's group order changing under a filter.** `projects-board.tsx` filters without re-sorting,
so a filtered view keeps the same relative order. Verified, but re-check if filters ever gain a sort.

**Merge conflict with navigation-latency phase 6.** That phase adds cached wrappers to
`lib/inventory.ts`. Whichever lands second resolves it; see the plan's cross-plan note.
