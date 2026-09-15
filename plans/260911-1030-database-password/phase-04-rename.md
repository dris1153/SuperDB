---
phase: 4
title: "Rename a project"
status: completed
priority: P2
effort: "3h"
dependencies: [3]
---

# Phase 4: Rename a project

## Overview

Making the project name editable in General settings. Split out of phase 3 because the write is one
line and the invalidation is the phase.

## Why this is not a small phase

Four things hold a project's name, and the first draft of phase 3 named the wrong one.

**The `identity` part is not cached, so dropping the part cache does nothing here.** `identity` is on
the `PART_NAMES` list, but `lib/part-cache.ts:26` types its table as
`Record<Exclude<Part, "identity">, number>`, and `app/api/projects/[ref]/[part]/route.ts:64` branches
straight to `readIdentity` without touching `readCached` or `writeCached`. So `dropProject` — and
therefore `recordWrite` — is a **no-op for the project name**. The claim "recordWrite drops the part
cache" is true and irrelevant.

**The real holder is the `owners` memo** in `lib/inventory.ts:114`: 60 seconds, keyed
`${user.id}:${ref}`, holding the whole `Project` body. It exports no way to invalidate itself —
`revalidatePath`, `router.refresh()`, `dropProject` and `dropUser` all miss it. **This phase must
therefore change `lib/inventory.ts`**, which the plan overview previously claimed it would not.

**The nav lives in a layout, not a page.** `components/project-nav.tsx` renders from
`app/(app)/p/[ref]/layout.tsx:24`. Per `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`,
a bare `revalidatePath("/p/abc")` invalidates the **page**; reaching the layout and everything under
it needs `type: "layout"`. Copying `revalidatePath(\`/p/${ref}\`)` from `resumeProject` leaves the old
name in the nav.

**The board lists it too.** `resumeProject` already calls `revalidatePath("/")` for exactly this
reason.

## A second-order trap — measure, do not reason about it

`resolveProject` is wrapped in React `cache()` (`lib/inventory.ts:119`), and a server action plus the
re-render it triggers happen inside one HTTP request. If the action resolves the project to get a
token and the layout then re-renders in that same request, the layout can read the body from before
the rename. Note that `resolveProject` returns **the same object reference** the memo holds
(`lib/inventory.ts:141,149`), so updating in place behaves differently from deleting.

Do not settle this by reading the docs. Rename a project, watch the header and the nav, and write down
what happened.

## Requirements

- Project name is editable and saves through `PATCH /v1/projects/{ref}`.
- The new name appears in the page header **and the nav** without a reload.
- A refused rename reports the reason and leaves the field as typed.
- The API's own bounds are `minLength: 1, maxLength: 256` — read from the spec. An empty name is one
  click away, so the field enforces something sane before the action is called, and the action
  enforces it again.

## Related Code Files

- Modify: `lib/inventory.ts` — a way to drop or update one `owners` entry
- Modify: `lib/project-actions.ts` — the rename action, beside `resumeProject`
- Modify: `components/project-settings/general.tsx` — the field becomes editable

## Implementation Steps

1. The invalidation helper in `lib/inventory.ts`.
2. The rename action: `PATCH`, then the helper, then `revalidatePath(\`/p/${ref}\`, "layout")` and
   `revalidatePath("/")`.
3. The editable field, with the bounds.
4. Rename a project with a warm memo and record what each surface shows.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## What landed

- `lib/mgmt-api.ts` — `updateProjectName`, the only field that endpoint accepts.
- `lib/inventory.ts` — `renameRemembered`, which corrects the memo **in place**.
- `lib/project-actions.ts` — `renameProject`: trim, bounds, PATCH, memo, two revalidations.
- `components/project-settings/general.tsx` — the field, which keeps what was typed when a rename is
  refused, because the commonest refusal is one the user fixes by editing what they typed.

**Mutating the memo rather than replacing or deleting it is the whole phase.** `resolveProject` is
`cache()`-wrapped, and a server action plus the re-render it triggers happen in one request — so the
layout that re-renders afterwards has already memoised the object the map handed out. Writing a fresh
entry into the map would not be read again until the next request; mutating the object the re-render
already holds is what it sees. Deleting would also cost the next resolve a full fan-out, which is the
expense the memo exists to avoid.

**`dropProject` is deliberately not called.** `identity` is the one part with no cache entry —
`part-cache.ts` types its table as `Exclude<Part, "identity">` and the route branches to
`readIdentity` before the cache is consulted — so calling it here would look like diligence and do
nothing. The client's own TanStack entry *is* written, through `useSetPart`; without that the browser
would hold the old name for its 60s stale window regardless of what the server did.

/p/[ref]/settings first load: 653,180 to 654,966 bytes.

## Success Criteria

- [ ] **Needs the app.** A rename shows in the header and the nav without a reload, measured with a
      warm memo — a cold one hides the entire defect.
- [x] The ceiling is written down: the memo is per process, so on a multi-instance deploy another
      instance keeps the old name until its own 60s entry expires. "Immediate" is true only for the
      instance that served the action.
- [x] An empty or 257-character name is refused before it reaches Supabase — `NAME_MIN`/`NAME_MAX`
      in the action, checked after trimming, because `" "` is a name the API accepts.
- [x] A refused rename keeps what was typed.
- [x] `pnpm test` still green — 396. The validation is three lines inside a `"use server"` module,
      which the suite cannot import, so it is a manual check rather than coverage.

## Risk Assessment

**A stale name.** The whole phase. Three of the four holders are easy to miss and the development
machine usually has a cold memo, so the defect hides exactly where it is being written.

**Colliding with the navigation-latency plan.** `260910-0042-navigation-latency` phase 6 edits
`lib/inventory.ts` as well. Whichever lands second rebases onto the other; this is recorded in the
plan overview's cross-plan note, which previously said the opposite.
