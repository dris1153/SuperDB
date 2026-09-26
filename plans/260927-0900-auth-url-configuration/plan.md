---
title: "Authentication › URL Configuration, against the original"
status: in-progress  # built and checked in a throwaway route; not clicked signed in
created: 2026-09-27
blockedBy: []
blocks: []
---

# Authentication › URL Configuration, against the original

Read from the original's source: `pages/project/[ref]/auth/url-configuration.tsx`,
`Auth/SiteUrl/SiteUrl.tsx`, `Auth/RedirectUrls/{RedirectUrls,RedirectUrlList,AddNewURLModal}.tsx`
and `Auth/Auth.constants.ts` (the URL patterns, `parseRedirectUrls`).

| # | Phase | Status |
|---|---|---|
| 1 | Pure rules + test, the `auth-urls` part, the three actions — measured on ZKVault | **completed** |
| 2 | The page, nav, Open-in-Supabase mapping, screenshots, docs | **completed** |

## Measured 2026-09-27 on ZKVault (restored after)

- `uri_allow_list` is one comma-joined string. The API strips every space (`"not a url at all"`
  reads back `"notaurlatall"`), keeps duplicates, accepts anything; ~1,900 characters saved, ~9,000
  refused `400 "…large values: URI_ALLOW_LIST"`.
- `site_url` accepts a wildcard and `"not a url"`; only `""` is refused, with a message about commas.

## Decisions (brainstorm 2026-09-27)

- **Add and remove send only the change.** The server reads the list, applies it, checks it (the
  original's URL patterns, no duplicates, 2 KiB in all) and PATCHes — so a URL added in the original
  a moment ago is not overwritten. Every save is audited.
- **Site URL must parse as a URL, with no `*` or comma** — the original only requires it non-empty,
  but its own description says wildcards cannot be used there, and the API would take garbage.
- UI as the original: Site URL card; Redirect URLs with Docs, checkbox rows (shift-click ranges),
  Clear selection / Remove (n) with a confirm listing the URLs, Total URLs, empty state; the Add
  dialog with several rows, paste split on whitespace and commas, errors per row.

## Success criteria

- [x] SuperDB's list and Site URL (values from the screenshot) render as the original's page does.
- [x] Add, remove and Site URL save round-trip on ZKVault through the app's own rules, restored.
- [x] typecheck, lint, test, build green.

## Built 2026-09-27

- Gate on ZKVault through `lib/auth-urls.ts`: added three URLs, re-adding one was refused, removed
  one, saved a Site URL; the original values were restored and compared equal.
- Throwaway route with the screenshot's values: the page, a shift-click selection of all three, the
  remove confirm, and the Add dialog refusing `example.com` and a URL already listed. Deleted after.
- The OAuth Server page's *Auth URL Configuration* link now opens this page instead of Supabase's.
- **Not clicked signed in**: the actions against a real project (they need a session).
- Review: one high finding fixed — the original's `appRegex` backtracks cubically on a line ending in
  `>` (200 hostile rows took 15.7s on the server). `>`, whitespace and commas are now refused before
  the patterns run, the whole request is capped at 2 KiB, and a regression test holds it under 200ms.
  Also fixed: row errors cleared on any edit, the OAuth Server part refetched after a Site URL save,
  a drawn checkbox in place of a nested Radix one, shift-click anchoring as the original, Enter saves,
  a no-op remove writes nothing.
