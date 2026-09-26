---
phase: 1
title: "Schema and actions"
status: in-progress  # code shipped, unverified — checked inside phase 5
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Schema and actions

## Overview

A table to hold one encrypted blob per project, and the read and write paths around it. The server
handles ciphertext only and has no way to inspect or validate it.

## Requirements

**Functional**
- One row per `(user, project ref)`, holding an opaque blob.
- Reading a project's blob; writing or replacing it.
- A project with no row is a normal state, not an error.

**Non-functional**
- RLS scopes every path to the caller.
- The server never sees plaintext and never tries to parse the blob.
- Re-running `supabase/schema.sql` changes nothing.

## Architecture

```sql
create table if not exists public.project_secrets (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_ref  text not null,
  vault_blob   text,
  updated_at   timestamptz not null default now(),
  primary key (user_id, project_ref)
);
```

Composite primary key, no surrogate id — the same shape as `project_order`, and for the same reason:
projects come from the Management API, so a ref is the only key available.

RLS matches the tables beside it: `for all to authenticated`, `using`/`with check`
`user_id = auth.uid()`, then `revoke all from anon`.

**The blob holds JSON**, `{ "db_password": "…" }`, not a bare string — the reason is already recorded
on `connection_secrets.vault_blob`: adding a second field later becomes a JSON change rather than a
migration.

**No table comment claiming what is inside.** The server cannot verify it, and a comment that says
"contains the database password" would be a claim nobody can check. Say it is client-encrypted and
opaque, which is true.

**Actions.** A server-only read helper plus a save action, in a new `lib/project-secrets.ts`.
Validate the ref with `isProjectRef` from `lib/project-ref.ts` and **cap the blob length** — the
existing `saveConnectionSecret` does not, which a review flagged, and there is no reason to repeat it.

The server stores the blob verbatim. It must not try to validate, parse or re-encode it.

## Related Code Files

- Modify: `supabase/schema.sql`
- Create: `lib/project-secrets.ts` — read helper plus the save action
- Read for context: `lib/vault-actions.ts::saveConnectionSecret` for the shape, and the
  `project_order` block as the precedent for a per-ref table

## Implementation Steps

1. Add the table with the other `create table` blocks, guarded with `if not exists`.
2. Enable RLS, add the policy, revoke from `anon`.
3. Write the read helper and the save action, with the ref check and the length cap.
4. Decide the cap and say why in a comment — a number with no reasoning gets raised by the next
   person who hits it.
5. Run `supabase/schema.sql`. Run it **twice**; the second run must change nothing.
6. Verify **under impersonation**, not as `postgres` — see below.

## Verifying this at all

The SQL editor runs as a superuser where `auth.uid()` is NULL, so an insert fails the `not null` on
`user_id` but a select or delete silently matches nothing and looks like a pass. The same trap wasted
two verification steps on an earlier plan.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<your user uuid>"}';
insert into public.project_secrets (project_ref, vault_blob)
  values ('aaaaaaaaaaaaaaaaaaaa', 'ciphertext');
select * from public.project_secrets;
rollback;
```

`rollback`, so the probe leaves nothing behind.

## What landed, and what did not

**The code shipped on 2026-09-11 in `833d91f`** — `lib/project-secrets.ts` and the `project_secrets`
table in `supabase/schema.sql`. Nothing imported it until the settings work below.

**None of the criteria below have been checked**, because every one of them is a question about a
database and `supabase/schema.sql` has never been run for this table. It has never held a row. The
same is true of `saved_queries` from the SQL editor plan; both are applied together in the settings
phases.

## Success Criteria

- [ ] `supabase/schema.sql` run twice in a row is a no-op the second time.
- [ ] Under impersonation, a row can be written and read back.
- [ ] A second user cannot read or write the first user's row — verified by impersonating two accounts.
- [ ] Saving twice replaces rather than duplicating.
- [ ] The save action refuses a malformed ref and an oversized blob.
- [ ] The blob is stored byte-identical to what was sent.

## Risk Assessment

**Someone adds validation to the blob.** It looks like an omission next to columns that have checks.
The server cannot read it — a comment must say the absence is deliberate.

**`auth.uid()` NULL in the SQL editor.** Makes a verification step pass while proving nothing. The
impersonation block above is the fix, not an optional extra.

**No length cap.** An unbounded `text` column plus an action that does not check is how a table grows
without anyone noticing. Flagged on `saveConnectionSecret` already; do not repeat it here.

**Elevation by habit.** Nothing here needs `security definer`. The policy scopes it; copying the
modifier from `delete_own_account` would widen what a bug could reach.
