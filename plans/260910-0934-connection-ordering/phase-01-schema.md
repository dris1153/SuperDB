---
phase: 1
title: "Schema"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Schema

## Overview

Adds the column that holds a user's chosen order, backfills it from the current `created_at` order so
nothing visibly moves on deploy, and adds the function that rewrites an ordering atomically.

## Requirements

**Functional**
- Every existing connection gets a `sort_order` matching its current position.
- `reorder_connections(ids)` sets the order of the caller's own connections in one statement.
- Re-running `supabase/schema.sql` on a populated database changes nothing.

**Non-functional**
- RLS still applies to the reorder path; no elevation.
- No constraint that a legitimate whole-list rewrite would violate.

## Architecture

`supabase/schema.sql` is a single idempotent file pasted into the SQL editor, and it doubles as the
migration path. Follow its existing converge blocks at the bottom rather than inventing a new style.

**Column**

```sql
alter table public.connections
  add column if not exists sort_order integer;
```

Backfill only rows that have none, so a re-run does not renumber a user's chosen order:

```sql
update public.connections c
   set sort_order = ranked.rn
  from (
    select id, row_number() over (partition by user_id order by created_at) as rn
      from public.connections
     where sort_order is null
  ) ranked
 where c.id = ranked.id and c.sort_order is null;
```

**Open question, settle here rather than in advance:** whether to follow with
`alter column sort_order set not null` plus `set default 0`, or leave it nullable and order
`nulls last`. `not null` is tidier but needs every insert path updated in the same change (Phase 2
does that); nullable is more forgiving of a row created between the backfill and the code deploy.
Decide by checking whether any insert path can run against the new schema with the old code.

**No unique constraint on `(user_id, sort_order)`.** Rewriting an ordering necessarily passes through
states where two rows share a number; a constraint would reject the legitimate write.

**Index**

```sql
create index if not exists connections_order on public.connections (user_id, sort_order);
```

**Function**

```sql
create or replace function public.reorder_connections(ids uuid[])
returns void language sql security invoker as $$
  update public.connections c
     set sort_order = array_position(ids, c.id)
   where c.user_id = auth.uid() and c.id = any(ids);
$$;
```

One statement, so a partial reorder cannot exist. `security invoker`, unlike `delete_own_account`,
because the existing "own connections" policy already scopes this correctly and elevation would only
widen what a bug could reach. The `user_id = auth.uid()` clause is belt and braces alongside RLS.

`array_position` returns null for an id not in `ids`, and the `c.id = any(ids)` filter keeps those
rows out — so a stale client list cannot null out an untouched connection's order.

## Related Code Files

- Modify: `supabase/schema.sql`
- Read for context: the converge blocks at the end of that file, and `delete_own_account` as the
  precedent for adding a function

## Implementation Steps

1. Add the column, guarded with `if not exists`.
2. Add the backfill, scoped to `sort_order is null`.
3. Decide and apply the null/not-null question above.
4. Add the index.
5. Add `reorder_connections`. Grant execute to `authenticated`; revoke from `anon` and `public`,
   matching how `delete_own_account` is handled in the same file.
6. Run the whole file against a populated database. Run it **twice** — the second run must change
   nothing.
7. Confirm ordering by hand: `select display_name, sort_order from connections order by sort_order`.
8. Call the function with a shuffled id array — **but not as `postgres`.** The SQL editor runs as a
   superuser where `auth.uid()` is NULL, so `user_id = auth.uid()` matches nothing and the function
   returns success having changed nothing. Both the positive and the negative test would pass while
   proving nothing. Impersonate first:

   ```sql
   begin;
   set local role authenticated;
   set local request.jwt.claims = '{"sub":"<your user uuid>"}';
   select public.reorder_connections(array[...]::uuid[]);
   select display_name, sort_order from public.connections order by sort_order;
   commit;
   ```

## Success Criteria

- [ ] Every existing row has a `sort_order` matching its old `created_at` position.
- [ ] `supabase/schema.sql` run twice in a row is a no-op the second time.
- [ ] `reorder_connections` with a shuffled array produces exactly that order.
- [ ] `reorder_connections` called with another user's ids changes nothing (RLS holds).
- [ ] `reorder_connections` with a partial id list leaves the omitted rows' `sort_order` intact.
- [ ] The null/not-null decision is recorded in the file as a comment explaining which and why.

## Deploy order — not optional

**Run this file before deploying the Phase 2 code.** Not after, not together.

Phase 2 makes both connection readers `.order("sort_order")`. Against a table without the column,
PostgREST returns error 42703 and `connectionsWithTokens` throws. That function feeds `resolveProject`,
which gates every project page and every DDL, write, table and connect action — and there is no
`error.tsx` anywhere, so each one becomes a 500. Account deletion goes through it too.

Nothing enforces the order automatically: there is no `supabase/migrations/`, and the README tells the
operator to paste this file into the SQL editor by hand.

Sequence: run the file → confirm `select sort_order from public.connections limit 1` works → exercise
the app once → then deploy. Leave a gap after pasting; PostgREST reloads its schema cache on a DDL
event trigger, and a request in the first seconds can still see the old schema.

## Risk Assessment

**Backfill renumbering a chosen order on re-run.** The `sort_order is null` guard is not enough on its
own: `WHERE` is applied before the window function, so `row_number()` restarts at 1 over the
unnumbered rows and a later addition would land second rather than last. The backfill offsets from
each user's current maximum for that reason. Test it by setting a custom order, adding a row with a
null `sort_order`, re-running the file, and confirming the chosen order survives and the new row is
last.

**A row created between backfill and code deploy.** Lands with a null `sort_order` (or 0 under the
not-null option) and sorts unpredictably. This is what the open question above is really about.

**Elevation by habit.** `delete_own_account` is `security definer` for a specific reason that does not
apply here. Copying that modifier without thinking would hand a reorder bug the ability to touch
another user's rows.
