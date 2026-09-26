---
phase: 3
title: "Reorder action"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 3: Reorder action

## Overview

The server action the UI will call: takes an ordered list of connection ids, writes it through the
Phase 1 function, and invalidates both screens that render the order.

Independent of Phase 2 — it can be built and tested against the SQL editor before any read honours
the column.

## Requirements

**Functional**
- Accepts an ordered array of connection ids and makes that the user's order.
- Both `/` and `/connections` show the new order on the next render.
- A caller cannot reorder another user's connections.

**Non-functional**
- Atomic: no partial reorder is observable.
- No new failure mode when the array is stale, partial, or contains unknown ids.

## Architecture

Lives in `lib/connections.ts` alongside the other connection mutations, not in a new file — it is one
function and the module is the hub for this table.

```ts
export async function reorderConnections(ids: string[]): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("reorder_connections", { ids });
  if (error) throw new Error(error.message);
}
```

The server action wrapping it belongs with the other inline actions in
`app/(app)/connections/page.tsx`, matching how `connectToken`, `saveConnection` and `disconnect` are
already defined there:

```ts
async function reorder(ids: string[]) {
  "use server";
  await reorderConnections(ids);
  revalidatePath("/");
  revalidatePath("/connections");
}
```

Both paths are revalidated because both render the order — `/` via `loadInventory`. Omitting `/`
would reproduce exactly the stale-render bug fixed in `saveConnectionSecret` earlier today.

**Why an RPC and not a loop.** `lib/vault-actions.ts::rotateVault` writes a sequence of independent
updates with no transaction, and a mid-loop failure there leaves an inconsistent vault. That is
recorded as a defect in [the scout report](../reports/260910-0028-whole-project-scout.md). Writing a
second loop of the same shape, in new code, with the defect already written down, would be
indefensible. One statement removes the failure mode rather than documenting it.

**Input handling.** Deliberately none beyond what the function already does. `array_position` plus
`c.id = any(ids)` means an unknown id is ignored and an omitted connection keeps its number. There is
no injection surface — ids go through the RPC as a typed `uuid[]` parameter, not string
interpolation — and a malformed uuid is rejected by Postgres before the update runs.

## Related Code Files

- Modify: `lib/connections.ts` (add `reorderConnections`),
  `app/(app)/connections/page.tsx` (add the `reorder` server action)
- Read for context: `lib/vault-actions.ts::saveConnectionSecret` for the revalidation pattern, and
  `rotateVault` for the loop this deliberately avoids

## Implementation Steps

1. Add `reorderConnections` to `lib/connections.ts` with a header comment saying why it is an RPC.
2. Add the `reorder` server action to the connections page.
3. `pnpm typecheck`, `pnpm lint`, `pnpm test`.
4. Test before any UI exists: call the action from a temporary button, or call the RPC in the SQL
   editor **under `set local role authenticated` with a `request.jwt.claims` sub** — see phase 1 step
   8. As `postgres`, `auth.uid()` is NULL, the function matches no rows, and the test passes without
   proving anything.
5. Test the negative case the same way: impersonate a second account and pass the first account's
   ids. Confirm nothing moves. Run it as `postgres` and it "passes" for the wrong reason.

## Success Criteria

- [ ] A shuffled id array produces exactly that order on both `/` and `/connections`.
- [ ] Another user's ids are silently ignored — no error, no change.
- [ ] A partial array leaves the omitted connections' `sort_order` untouched.
- [ ] An unknown or malformed id does not corrupt the rows that are valid.
- [ ] No update loop was introduced.
- [ ] `pnpm test` still 262/262.

## Risk Assessment

**Forgetting `revalidatePath("/")`.** The board would keep the old order until something else
invalidated it — the same class of bug as the credential one fixed this morning, and just as
confusing to diagnose. It is an explicit success criterion for that reason.

**A stale client array.** The user drags while a connect completes in another tab; the array omits
the new connection. It keeps its own number and may sort oddly until re-dragged. Acceptable, and
better than the alternative of rejecting the write.

**Trusting the client's order blindly.** That is correct here — the order *is* a user preference,
there is nothing to validate it against, and RLS bounds the blast radius to the caller's own rows.
Worth stating so it reads as a decision rather than an oversight.
