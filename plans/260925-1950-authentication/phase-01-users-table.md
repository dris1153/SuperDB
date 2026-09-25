---
phase: 1
title: "The page, and the users table"
status: pending
priority: P2
effort: "6h"
dependencies: []
---

# Phase 1: The page, and the users table

## Overview

Open the `auth` slug, give it the three-group nav the screenshot shows, and list a project's users.

## Requirements

- `/p/{ref}/auth` reachable from the project rail; the slug stops being greyed.
- The Authentication row leaves the settings nav.
- A sub-nav: MANAGE (Users, OAuth Apps), NOTIFICATIONS (Emails), CONFIGURATION (the twelve pages
  that are not being built, greyed with the endpoint behind each).
- The users table with the columns the original shows, a search box, a column picker, and paging.

## Architecture

**Users need a project credential.** `lib/project-key.ts` already reads `service_role` and memoises
it for a minute; `lib/storage-api.ts` is the shape to copy for a client against
`https://{ref}.supabase.co/auth/v1`.

**Paging is `page` and `per_page`, and the totals are in headers:**

```
GET /admin/users?page=1&per_page=50
  x-total-count: 3
  link: </admin/users?page=2&per_page=2>; rel="next", … rel="last"
  {"users": […], "aud": "authenticated"}
```

`x-total-count` is the "Total: 1 user" line. `link` carries `rel="next"` only while there is one, so
it decides whether the next-page control is live.

**Search is `?filter=`, server-side.** Measured: it narrows `x-total-count`. `?email=` is accepted
and ignored, which is worse than an error — it looks like it worked. The search box sends `filter`.

**The column picker is state.** Eight columns overflow; which ones are on screen is a preference
that should survive a reload, so it belongs in `localStorage` keyed by project, not in a URL.

## Related Code Files

- Create: `app/(app)/p/[ref]/auth/layout.tsx`, `page.tsx`
- Create: `components/auth/auth-nav.tsx`, `users-table.tsx`, `column-picker.tsx`
- Create: `lib/auth-api.ts` — the GoTrue client, `server-only`
- Create: `lib/auth-users.ts` (+ test) — the `User` type, provider summary, paging arithmetic
- Modify: `lib/project-part-names.ts`, `lib/project-parts.ts`, `lib/part-cache.ts`
- Modify: `components/project-nav.tsx`, `components/project-settings/settings-nav.tsx`

## Implementation Steps

1. `lib/auth-api.ts` wrapping the admin API, reusing `projectKey` and the error-unwrapping shape
   `lib/storage-api.ts` established.
2. `lib/auth-users.ts`: the `User` type, `providersOf(user)` from `app_metadata.providers`, and
   `pageCount(total, perPage)`. Pure, tested — including a user whose `identities` is null, which
   is every user in a listing.
3. An `auth-users` part taking page, per_page and filter; TTL 0.
4. The table: UID, display name, email, phone, providers, provider type, created at, last sign in.
   `user_metadata.display_name` is where the name lives when there is one.
5. Search, debounced, sending `filter`.
6. The column picker, persisted per project.
7. Paging from `x-total-count`, with the total shown as the original shows it.
8. The nav, the layout, and the settings-nav removal. A new route needs `next typegen` first.

## Success Criteria

- [ ] The rail's Authentication entry is live and lands on Users.
- [ ] The table lists real users with real values.
- [ ] Searching narrows the list **and** the total, proving it is the server filtering.
- [ ] Hidden columns stay hidden after a reload.
- [ ] A project with no users says so rather than showing an empty grid.
- [ ] Authentication no longer appears in the settings nav.

## Risk Assessment

- **`service_role` reaches GoTrue as well as Storage now.** Same containment rules: `server-only`,
  never in a response, never stored.
- **A project with many users.** Paging is server-side and the filter is too, so the browser never
  holds more than a page.
