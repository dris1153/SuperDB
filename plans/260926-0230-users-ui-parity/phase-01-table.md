---
phase: 1
title: "The table, and its toolbar"
status: in-progress  # built; the grid itself has not been looked at in a browser
priority: P2
effort: "6h"
dependencies: []
---

# Phase 1: The table, and its toolbar

## Overview

Bring the grid and the controls above it to what the original shows: a checkbox, an avatar, a full
UID, provider icons, Supabase's own vocabulary, full timestamps, and a toolbar with four controls
rather than two.

## Requirements

- Checkbox column, with bulk delete behind it.
- Avatar column, failing closed to initials.
- UID in full, providers as icon plus proper name, `Social` where we say `OAuth`.
- Timestamps as `Tue 25 Aug 2026 09:40:19 GMT+0700`.
- Toolbar: search-field selector, search, column picker, refresh, Add user as a split button.
- Column rules and horizontal scroll, as the original has.

## Architecture

**The part is picking away the avatar.** `lib/project-parts.ts` reduces `user_metadata` to
`display_name`, and `avatar_url` is in the response — the measured user has an
`avatars.githubusercontent.com` URL. Add it to the pick; keep picking rather than passing the object
through, for the reason that comment already gives.

**The search-field selector is not decoration.** There is one `?filter=` and it is a substring
match, so:

| Field | Request |
|---|---|
| Email address | `GET /admin/users?filter=…` |
| Phone | the same |
| UID | `GET /admin/users/{id}` — a lookup, not a search |

The UID branch needs a branch in the part reader, and an id that is not a UUID should say so rather
than spend a request.

**Sort: measured 2026-09-26, and the original's control cannot be built.**

```
sort=created_at asc     200   order flipped        <- the direction rides in the same parameter
sort=created_at&order=desc   200   order unchanged  <- `order` is not a parameter
sort=id                 400   bad field for sort
sort=email              400   bad field for sort
sort=updated_at         400   bad field for sort
sort=last_sign_in_at    400   bad field for sort
```

`sort` is real and validated — a bad field is refused rather than ignored — and `created_at` is the
only one of those it accepts. So **"Sorted by user ID" is not buildable**: the API will not order by
id, and ordering fifty rows in the browser is wrong on page two.

What ships instead is the one thing the API can do, honestly labelled: newest first (the default)
or oldest first, server-side, correct across pages.

**Provider icons.** `developer-icons` is already a dependency and carries Google, GitLab, Discord,
Slack, Azure, Bitbucket, Figma, LinkedIn, Notion and Twitter; `@tabler/icons-react` has brand icons
it lacks. A provider with no icon shows its name alone rather than a placeholder box.

**`Social`, not `OAuth`.** `providerTypeOf` carries a comment saying the rule is ours because the
API has no such field. The rule stays; its words become the original's.

**Bulk delete.** Selection is component state, cleared when the page or the filter changes — a
selection that survives a filter change is a selection whose rows are no longer on screen. The
action takes the ids, validates each as a UUID, deletes one at a time, and returns which succeeded:
a batch where three of five failed must not report success, and the two that went are gone.

## Related Code Files

- Modify: `lib/project-parts.ts` — avatar in the pick, UID lookup branch
- Modify: `lib/auth-users.ts` — `providerTypeOf` wording, provider display names
- Modify: `lib/format.ts` — the full timestamp
- Modify: `components/auth/users-table.tsx`, `components/auth/column-picker.tsx`
- Create: `components/auth/provider-icon.tsx`, `components/auth/bulk-delete.tsx`
- Modify: `lib/auth-user-actions.ts` — bulk delete

## Implementation Steps

1. **Measure first:** whether `GET /admin/users` sorts. Record the answer here, either way.
2. `lib/format.ts`: a full timestamp formatter, with a test — the offset is the machine's, so pin
   the shape rather than the value.
3. The part: `avatar_url` in the pick; a UID branch that reads one user.
4. The provider icon component and the `Social` wording, with the display-name map tested.
5. The grid: checkbox, avatar, full UID, column rules, horizontal scroll.
6. The toolbar: field selector, refresh, split Add user.
7. Bulk delete: server action with per-id results, a confirm, and partial-failure reporting.

## Todo List

- [x] Sort measured and recorded
- [x] Full timestamp + test
- [x] Avatar through the part
- [x] UID lookup branch
- [x] Provider icons and `Social`
- [x] Checkbox, avatar, rules, scroll
- [x] Toolbar controls
- [x] Bulk delete with per-row outcomes

## Success Criteria

- [x] A row shows avatar, full UID, provider icon and name, `Social`, and full timestamps.
- [x] Searching by UID fetches that user; searching by email filters server-side as it does today.
- [x] Deleting three reports each outcome, and a partial failure is not reported as success.
- [x] Changing page or filter clears the selection.
- [x] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` stay green.

## Risk Assessment

- **Bulk delete ends real accounts.** One request each, no undo, a confirm in front, per-row results
  after.
- **Avatars are third-party URLs.** Rendering one tells `githubusercontent.com` that this page was
  opened. Fail closed to initials, and never block a row on an image.
- **A sort that only sorts one page** looks right until a project has fifty-one users. The
  measurement decides whether it exists at all.

## Built 2026-09-26

- `lib/format.ts` gained `timestamp()`, which prints `Tue 25 Aug 2026 09:40:19 GMT+0700` — pinned by
  shape in a test, because the offset belongs to whoever is reading.
- `providerTypeOf` keeps its rule and takes the original's words: `Social` and `Email` in place of
  `OAuth` and `Basic Auth`. `providerName` spells `github` as `GitHub`, and title-cases anything it
  has not met.
- The part picks `avatar_url` alongside the display name, through `avatarOf`, which refuses anything
  that is not plain `https` — it goes straight into an `img src`.
- Searching by UID reads that user through `GET /admin/users/{id}` and shapes it as a page of one. A
  malformed id is an empty result rather than a request.
- Sort is `created_at desc` or `created_at asc`, server-side. **Not** "Sorted by user ID", which the
  API refuses.
- The grid has the checkbox, the avatar, the full UID, column rules and horizontal scroll; the
  toolbar has the field selector, the sort, the column picker, a refresh that indicates, and Add
  user as a split button.
- Bulk delete reports per id. A batch where some failed keeps its dialog open and names them: the
  ones that went are gone, and a toast would be the only record otherwise.

**The refresh button tracks its own state.** With `keepPrevious` the query stays `ready` through a
refetch, so reading `status` would have given a button that never indicated.

## Not verified

Nobody has looked at the grid in a browser. What is checked: 543 tests, typecheck, lint, build, and
the two API behaviours this phase rests on — `sort=created_at asc` flipping the order, and a bad
sort field being refused rather than ignored.
