---
phase: 1
title: "Schema and RPC"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Schema and RPC

## Overview

A table to hold the user's project order, and the two statements that write and clear it. Projects
come from the Management API, so unlike connections there is no existing row to add a column to.

## Requirements

**Functional**
- One row per `(user, project ref)`, holding a position.
- Writing a whole order in one statement, creating rows that do not exist yet.
- Clearing the user's order entirely.

**Non-functional**
- RLS scopes every path to the caller; no elevation.
- Re-running `supabase/schema.sql` changes nothing.

## Architecture

```sql
create table if not exists public.project_order (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_ref  text not null,
  sort_order   integer not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, project_ref)
);
```

The composite primary key is also the `on conflict` target, so there is no surrogate id and no
separate unique index. `project_ref` has no foreign key because nothing in this database holds
projects — validation happens in the action, against the existing `isProjectRef`.

RLS matches the four tables beside it: `for all to authenticated`, `using`/`with check`
`user_id = auth.uid()`, then `revoke all from anon`.

**No backfill.** The table starts empty and the first drag sends the whole visible order, seeding
every row in one statement. Worth stating plainly: the `connections` backfill existed because rows
were already there, and it is exactly where a defect shipped yesterday. There is no equivalent
surface here, and nobody should add one.

**Writing**

```sql
create or replace function public.reorder_projects(refs text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.project_order (user_id, project_ref, sort_order)
  select auth.uid(), r.ref, r.ord
    from unnest(refs) with ordinality as r(ref, ord)
  on conflict (user_id, project_ref) do update
    set sort_order = excluded.sort_order, updated_at = now();
$$;
```

`with ordinality` supplies the position for free, so no index arithmetic in TypeScript. One
statement, so a partial reorder cannot exist. `security invoker` for the same reason as
`reorder_connections`: the policy already scopes it, and `definer` would only widen what a bug could
reach.

**Clearing** — a second function, or a plain delete from the action. Either way it removes only
`user_id = auth.uid()` rows and returns the board to connection order.

## Related Code Files

- Modify: `supabase/schema.sql`
- Read for context: the `connections` RLS block and `reorder_connections` as the precedent for both
  the policy shape and the grant/revoke pair

## Implementation Steps

1. Add the table, guarded with `if not exists`, placed with the other `create table` blocks.
2. Enable RLS, add the policy, revoke from `anon` — copy the shape used by `connection_secrets`.
3. Add `reorder_projects` near `reorder_connections` so the two functions sit together.
4. Add the grant/revoke pair, matching `delete_own_account`.
5. Decide and implement the clear path.
6. Run the whole file against the database. Run it **twice**; the second run must change nothing.
7. Test the function **under impersonation**, not as `postgres` — see the note below.

## Verifying this at all

The SQL editor runs as a superuser where `auth.uid()` is NULL. `reorder_projects` would insert rows
with a null `user_id`, violating `not null`, so it fails loudly — but the *clear* path and any
select would silently match nothing and appear to pass. Impersonate:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<your user uuid>"}';
select public.reorder_projects(array['aaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbb']);
select * from public.project_order order by sort_order;
rollback;
```

`rollback` rather than `commit`, so the probe leaves nothing behind.

## Success Criteria

- [ ] `supabase/schema.sql` run twice in a row is a no-op the second time.
- [ ] Under impersonation, `reorder_projects` inserts the array in order.
- [ ] Calling it again with a different order updates rather than duplicating.
- [ ] A second user's refs cannot be written or read — verified by impersonating two accounts.
- [ ] The clear path removes only the caller's rows.
- [ ] No backfill was added.

## Risk Assessment

**Someone adds a backfill later.** It looks like an omission next to the `connections` block right
above it. The comment in the file must say the emptiness is deliberate.

**`auth.uid()` NULL in the SQL editor.** Makes a verification step pass without proving anything —
the same trap that made two steps of the previous plan worthless. The impersonation block above is
the fix, not an optional extra.

**Elevation by habit.** `delete_own_account` is `security definer` for a specific reason that does
not apply here. Copying the modifier without thinking would let a bug in the ordering reach another
user's rows.

**A ref that is not a project ref.** `text` accepts anything. Validation is the action's job in
phase 2; the column deliberately does not try.
