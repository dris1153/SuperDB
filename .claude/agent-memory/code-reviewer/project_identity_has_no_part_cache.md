---
name: identity-has-no-part-cache
description: The project name is held only by the owners memo in lib/inventory.ts — dropProject/recordWrite cannot invalidate it, and nothing exports a way to
metadata:
  type: project
---

`identity` is on `PART_NAMES` but is **not** in the part cache. `PART_TTL_MS` is typed
`Record<Exclude<Part,"identity">,number>` and the route handler short-circuits to `readIdentity`,
which calls `resolveProject` and never touches `readCached`/`writeCached`. So `dropProject(ref)` —
and therefore `recordWrite` — is a **no-op for the project name**.

The only server-side holder is the `owners` memo in `lib/inventory.ts` (60s, keyed
`${user.id}:${ref}`, holds the whole `Project` body). It has no exported invalidation:
`revalidatePath`, `router.refresh()`, `dropProject` and `dropUser` all miss it. A second-order trap
sits behind it — `resolveProject` is `cache()`d, and a server action plus its revalidation re-render
run in one HTTP request, so the action's own resolve can feed the layout a pre-mutation body.
`resolveProject` returns the *same object reference* stored in the memo, which is why updating it in
place is a workable answer where deleting it may not be.

**Why:** any plan that mutates something `GET /v1/projects/{ref}` returns (name today; status,
region later) will reach for `recordWrite` by analogy with the table editor and get no invalidation
at all — invisible in development, where the memo is usually cold.

**How to apply:** when a change renames or otherwise mutates project-level data, ask what touches
`owners`, not what touches the part cache. Also check `revalidatePath` target: the nav lives in
`app/(app)/p/[ref]/layout.tsx`, and a literal-path call without `type: "layout"` invalidates the page
only. See [[module-state-splits-per-next-layer]] and [[csr-fanout-amplifies-resolveproject]].
