---
phase: 4
title: "The Policies tab"
status: completed
priority: P3
effort: "4h"
dependencies: [2]
---

# Phase 4: The Policies tab

## Overview

The RLS policies governing storage, grouped as the original groups them: per bucket, then the raw
tables underneath.

## Requirements

- Policies on `storage.objects` and `storage.buckets`, read from the catalog.
- Grouped by the bucket they name, with the rest under a heading of their own.
- Create, edit and delete, reusing whatever the table editor's policy support already does.

## Architecture

Storage policies are ordinary Postgres RLS policies on two tables in the `storage` schema. The app
already reads policies — `listPolicies` in `lib/table-editor.ts` — and already runs SQL. Nothing
new is needed at the data layer.

**Grouping by bucket is a text question, not a schema one.** A policy belongs to a bucket because
its expression mentions `bucket_id = 'name'`. That is a heuristic and the UI says so: a policy that
does not match any bucket is not hidden, it goes under "Other policies under storage.objects", which
is exactly what the original does.

## Related Code Files

- Create: `components/storage/storage-policies-tab.tsx`, `components/storage/policy-dialog.tsx`
- Create: `lib/storage-policies.ts` (+ test), `lib/storage-policy-actions.ts`
- Modify: `lib/table-editor.ts` — `listPolicies` now reads `polpermissive`
- Modify: `lib/buckets.ts` — `countBucketPolicies` delegates to `policyBuckets`

## Implementation Steps

1. A part reading policies for the two storage tables.
2. `lib/storage-policies.ts`: match a policy to a bucket from its expression, tested against both
   quoting styles and a policy naming two buckets.
3. The two sections from the original, with the per-bucket group empty-stated when a project has no
   buckets yet ("Create a bucket first to start writing policies").
4. Create and delete through the existing policy paths.

## Success Criteria

- [x] Policies on both storage tables are listed.
- [x] A policy naming a bucket appears under that bucket; one that names none is still shown, in a
      section of its own.
- [x] Creating and deleting work and the list refreshes.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 489 tests.

## Risk Assessment

- **The bucket heuristic will be wrong sometimes.** Being wrong must mean "shown in the other
  group", never "not shown".

## What was built differently

**There was nothing to reuse.** The plan assumed the table editor's policy support could be
borrowed; `components/table-editor/rls-panel.tsx` only *lists* policies, and the app had no way to
create one. So this phase built the creation path, following the rule `lib/ddl-actions.ts` sets for
every other schema change: the dialog builds a preview and the **server builds the statement again**
from the template id and the bucket name. A preview the user approved and a statement the server
composed are deliberately two different objects — otherwise "confirm this SQL" would mean "run
whatever was posted".

**Four templates, not a policy editor.** A policy is arbitrary SQL, and a builder covering that
would be a worse SQL editor than the one already in this app. The four shapes answer "who may touch
this bucket"; the tab links to the SQL editor for anything else, and says so.

**No edit.** Postgres has `ALTER POLICY`, but changing who may read a bucket by editing an
expression in a form is the kind of thing that wants the SQL in front of you. Drop and write
another.

**Dropping asks first.** An earlier version did not, on the reasoning that removing a policy makes
access stricter. That reasoning is wrong — see below.

## The heuristic, and why it fails safe

A policy is matched to a bucket by finding the bucket's quoted name in its expression, because the
database models no relation between the two. That is wrong in both directions: `owner = 'avatars'`
matches a bucket called `avatars`, and a policy governing every bucket matches none.

Being wrong therefore has to mean **listed in the wrong place**, never **not listed** — which is
what the "Other policies under storage.objects" section is for, and what the test pins. A policy
naming two buckets appears under both, so the guarantee is "at least one section", not "exactly
one".

The quoting also means a substring is not a match: `'catalog'` does not appear inside `'catalogue'`,
because the quotes are part of what is searched for.

## One thing worth knowing about the SQL

A bucket name can contain a quote — measured, the API accepts almost anything — and that name is
interpolated into a policy expression. `quoteLiteral` and `quoteIdent` handle it, and the tests pin
both: a bucket called `it's mine` and a policy called `say "hi"`.

## What review caught

**"Removing a policy makes access stricter" is false, and it was the justification for a one-click
delete.** Postgres ORs permissive policies together and ANDs restrictive ones over the top. So
dropping a *permissive* policy takes access away — but dropping a **restrictive** one widens it.
Worse, `listPolicies` did not read `polpermissive`, so neither the list nor the reader could tell
the two apart. The column is read now, restrictive policies carry a badge, and dropping goes through
a confirm that says which direction this particular one moves.

**The tab asserted two false things whenever the bucket list was not ready.** `names` fell back to
`[]`, which made the page print "Create a bucket first to start writing policies" to a project full
of them, and file every policy under "These name no bucket this project has". Neither said a read
had failed. And it was not a rare frame: `buckets` fans out to the Storage API *and* a SQL read, so
it is normally the slower of the two — the wrong grouping was the usual first paint. The tab waits
for both parts now, and reports the bucket read's own failure when that is what went wrong.

**The same heuristic existed twice and the two copies disagreed.** `countBucketPolicies` in
`lib/buckets.ts` built its needle as `'${bucket}'`; `policyBuckets` here used `quoteLiteral`. For a
bucket called `it's mine`, Postgres renders `'it''s mine'` — so the Buckets tab showed **0 policies**
for a bucket this tab filed three under. One delegates to the other now, with the apostrophe pinned
in `buckets.test.ts`.

**A NUL byte in a bucket name threw past the audit.** `quoteLiteral` rejects one, `bucketNameProblem`
does not, and the statement was built outside the error boundary — so the action threw instead of
returning a result, and no audit line was written for the attempt. Built inside now, the way
`lib/ddl-actions.ts` does it for exactly this reason.

**The policy name limit was wrong.** 100 characters, where Postgres truncates identifiers at 63
**bytes**. A longer name previewed in full and was created under a different one; two names sharing
63 bytes collided with an "already exists" nothing on screen could explain.

Smaller: the bucket is now checked against the project's own list rather than trusted, so a policy
cannot be scoped to a bucket that does not exist; the Buckets tab's policy count is refetched after
a write here; `POLICY_TEMPLATES` is frozen, being the allowlist the server trusts; and the memo
dependencies were rewritten to key on the query's own array rather than a fresh object per render.
