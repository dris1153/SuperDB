---
phase: 2
title: "A project credential, and buckets"
status: completed
priority: P2
effort: "6h"
dependencies: [1]
---

# Phase 2: A project credential, and buckets

## Overview

The first time this app uses a project's own key. Then the Buckets tab: list, create, edit, delete.

## Requirements

- Read `service_role` (or `secret`) on demand, cache 60s in-process, never store, never expose.
- List buckets with everything the original's table shows: name, public flag, policy count, file
  size limit, allowed MIME types.
- Create a bucket with the three options the dialog offers.
- Edit and delete a bucket, with the emptiness rule handled honestly.

## Architecture

**The credential.** `lib/project-key.ts` exports `projectKey(ref)`, which resolves the project,
reads `/api-keys?reveal=true`, prefers `service_role` and falls back to a `secret` key, and memoises
for 60 seconds. The store is pinned to `globalThis` — `lib/part-cache.ts` documents why a plain
module-level `Map` silently gives each Next bundle layer its own copy, and a credential cache with
that bug would be a cache that never hits.

It is `server-only`. Nothing returns it to a caller that could serialise it.

**The client.** `lib/storage-api.ts`, also `server-only`, wrapping
`https://{ref}.supabase.co/storage/v1`. Errors arrive as HTTP 400 with the real status inside the
body (`{"statusCode":"409","error":"ResourceNotEmpty",...}`), so it parses that out rather than
reporting every failure as 400.

**Bucket shape.** `GET /bucket` includes `type` ("STANDARD"); `GET /bucket/{id}` does not. The list
is the only place the bucket type is visible. It is carried through the part but **not** filtered
on: no project to hand could create an analytics or vector bucket, so a filter would be a guess
about a response nobody has seen.

**Creating answers `{name}` only** — not the created bucket — so the UI refetches rather than
inventing a row.

**Deleting.** A bucket with objects is refused with `ResourceNotEmpty`. `POST /bucket/{id}/empty` is
**asynchronous** and says so, so "empty then delete" fails. The delete confirm offers to remove the
objects first — list with `/object/list-v2`, which is flat, then `DELETE /object/{bucket}` with every
name — and only then deletes the bucket.

**Policy count.** The original's POLICIES column is the number of RLS policies naming that bucket.
That is a SQL question, answered with the runner the app already has, and it is the same data phase
4 needs.

## Related Code Files

- Create: `lib/project-key.ts`, `lib/storage-api.ts`, `lib/buckets.ts` (+ test)
- Create: `lib/bucket-actions.ts`
- Create: `components/storage/bucket-table.tsx`, `bucket-dialogs.tsx`
- Modify: the part registry and `lib/part-cache.ts`

## Implementation Steps

1. `projectKey(ref)` with the `globalThis`-pinned 60s memo, and a test for the expiry arithmetic.
2. `lib/storage-api.ts`: list, create, update and delete, plus the error-unwrapping that turns a
   400-with-409-inside into something the UI can branch on. Not `getBucket` — the list already
   carries every field, including `type`, which reading one bucket does not. Not `emptyBucket` — it
   is asynchronous and cannot be followed by a delete.
3. `lib/buckets.ts`: the `Bucket` type, formatting for the limit and MIME columns, and the
   `Unset (50 MB)` fallback the original shows when a bucket sets no limit of its own. Pure, tested.
4. A `buckets` part; TTL 0, since every control on the page writes.
5. The table, matching the original's columns. The row link was added in phase 3, once there was
   a page for it to open.
6. The create dialog: name, and three switches that reveal their inputs — public, size limit, MIME
   types. Name is fixed at creation and the dialog says so, as the original does.
7. Delete, with the two-step emptiness handling above.
8. Verify.

## Success Criteria

- [x] The table lists this project's buckets with real values.
- [x] Creating a bucket with each option produces a bucket with those settings.
- [x] Deleting a bucket with objects explains itself and offers to clear it first.
- [x] `service_role` never appears in a response body or a client bundle — `lib/project-key.ts` and
      `lib/storage-api.ts` are both `server-only` and neither returns the key.
- [x] The memo is per connection and per project, and expires after 60s.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 470 tests.

## Risk Assessment

- **This is the most dangerous credential Supabase issues.** Every use is server-side and it is
  never written anywhere. **Reads are not audited** — only writes go through `recordWrite`, and
  listing buckets reaches for the key on every visit. The trail covers what was changed, not what
  was read.
- **A project with legacy keys disabled has no `service_role`.** The fallback to a `secret` key is
  written but unmeasured — no project to hand had legacy keys off.
- **Deleting a bucket destroys its objects.** Type-the-bucket-name friction, as with the database
  password and the legacy API keys switch.

## What was built differently

**The delete confirm does not count the objects first.** The plan wanted it to say how many there
are. The API refuses a non-empty bucket with a message that says exactly that, so counting would be
a round trip to tell the user something the failure already tells them. The confirm offers to remove
the contents and otherwise lets the refusal speak.

**Draining a bucket is a loop, not a call.** `list-v2` returns one page and a `hasNext` with no
cursor to resume from. Deleting what came back and asking again is what empties a bucket with more
objects than a page holds; the loop is bounded, and overrunning the bound fails loudly because the
bucket delete that follows refuses while anything remains. A single `listAllObjects` would have
silently half-emptied a large bucket and then failed the delete with no explanation.

**The policy count shares its heuristic with phase 4.** `countBucketPolicies` matches
`bucket_id = 'name'` in a policy's expression. It is text matching over SQL, so it can only
undercount — and the test pins the case that matters: a bucket named `catalog` must not claim a
policy belonging to `catalogue`.

**The buckets part makes two upstream calls and tolerates one failing.** The buckets come from the
project's Storage API; the policy count is a SQL question. A connection that cannot run SQL still
sees its buckets, with the count at zero, rather than an error where the table should be.

**`projectKey` is keyed by connection, not by project.** Two users can reach the same project
through different connections, and a cache keyed on the ref alone would serve one of them the
other's credential.

## What review caught

**Editing a bucket silently raised its size limit.** The dialog's reset block seeded the name, the
switches and the MIME list from the bucket — but not the size field, which stayed at its `"50"` /
`"MB"` default. Opening Edit on a bucket limited to 1 MB showed the switch already on with 50 MB in
the box, so saving without touching anything multiplied the limit fiftyfold. The sibling settings
component had been doing this correctly all along with `fromBytes`.

**The drain loop counted what it asked for, not what it got.** `DELETE /object/{bucket}` returns the
rows it actually removed — measured with three prefixes where one did not exist, it answered two.
Without reading that, an object the API refuses to delete would be re-listed forever: two thousand
requests inside one server action, an audit line claiming a million objects removed, then a bucket
delete failing for reasons the log could not explain. It now counts returned rows and stops when a
page removes nothing.

**The bucket name rule was invented.** `^[a-z0-9][a-z0-9.-]*$`, described in the code as "Supabase's
own rule". Measured 2026-09-25: the API accepts `Catalog`, `with_underscore`, `with space`,
`dot.name` and `a` — every one a 200. And because the same check gated editing and deleting, a
bucket created anywhere else with a capital letter would have been listed by this page and then
refused when someone tried to remove it. What is left rejects only what cannot be a name at all.

**Server action arguments were not checked at runtime.** These are endpoints, the types are erased,
and `input.name.trim()` on a null threw out of the action as an opaque 500 rather than a result.
`settingsProblem` checks the shape now, and ownership is established first so a caller with no claim
on the project learns nothing from the difference between the two failures.

**Buckets are addressed by `id`, not by display name.** Equal for buckets this app creates; they can
differ for one created elsewhere, and then the name addressed nothing.

**A failed refetch reported a successful write as a failure.** `invalidateQueries` rejects when the
refetch does, so a network blink after a delete left the confirm open saying the server could not be
reached — sending someone to repeat a deletion that had already happened.

**The key memo had four smaller problems:** it flushed every user's entry when full rather than the
oldest, kept an expired key in memory when the refresh meant to replace it failed, collapsed every
upstream reason into one sentence so a missing OAuth scope was unreportable, and its invalidation
hook had no callers and the wrong shape — what makes a cached key wrong is a rotation on the
project, not a change of connection. `forgetProjectKey(ref)` is called from the API keys actions
now, the only place in this app that can invalidate one.

The TTL moved to `lib/key-window.ts` so it could be tested: `project-key.ts` is `server-only` and
reaches the network, and the window a bypass-RLS credential stays in memory is the one thing there
worth pinning.
