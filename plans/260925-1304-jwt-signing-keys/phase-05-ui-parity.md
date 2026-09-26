---
phase: 5
title: "Matching the dashboard's layout"
status: completed
priority: P2
effort: "3h"
dependencies: [4]
---

# Phase 5: Matching the dashboard's layout

## Overview

The data was right and the presentation was not. Eight differences from the screenshot, all in the
view layer — no part, action, confirm or audit path was touched.

## What differed

| Original | Before this phase |
|---|---|
| Per-section title, "JWT Keys" + a sentence | The layout printed "Project Settings" over every section |
| A `CREATE STANDBY KEY` card with copy and a button | A bare button |
| A table with `STATUS · KEY ID · TYPE · ACTIONS` headers | A card of rows, no column headers |
| `CURRENT KEY` / `PREVIOUS KEY` badges, coloured, with a key icon | Group headings plus an algorithm badge |
| `ECC (P-256)`, `Legacy HS256 (Shared Secret)` | Raw `ES256`, `HS256` |
| `LAST ROTATED AT` as "16 days ago" | "Created 2026-09-04" |
| A kebab in an `ACTIONS` column | Text buttons |
| Two tables, the second titled "Previously used keys" | Four separate groups |

## Decisions

**Each settings page titles itself.** The layout's fixed header is gone; `SettingsHeader` is used by
all four pages. General, API Keys and Password Manager gained real titles as a side effect, which is
the point — one heading reading "Project Settings" over every section said nothing.

**Destructive items in the kebab are destructive-coloured and sit below a separator.** The kebab
matches the original, but it hides an action that cuts off live sessions behind one click. Colour
and separation are what keep it from looking like everything else in the menu.

**The create card is always shown**, not hidden once a standby exists. The API permits more than one
standby, and a card that vanishes is a difference from the original that buys nothing.

**Three pure functions rather than inline templates**, each tested: `describeAlgorithm`,
`statusBadge`, and `timeAgo` in `lib/format.ts`. `timeAgo` treats a future timestamp as clock skew
between this machine and Supabase's, not as a prediction.

## Related Code Files

- Create: `components/project-settings/settings-header.tsx`, `signing-key-table.tsx`,
  `lib/format.test.ts`
- Delete: `components/project-settings/signing-key-list.tsx`
- Modify: `app/(app)/p/[ref]/settings/layout.tsx` and all four settings pages,
  `components/project-settings/jwt-keys.tsx`, `lib/format.ts`, `lib/signing-keys.ts`,
  `lib/signing-keys.test.ts`

## Success Criteria

- [x] Status, key id, type and actions read as a table with column headers.
- [x] Badges carry the dashboard's own words and the repo's existing colour tokens.
- [x] The retired table shows a relative time; the active table does not.
- [x] Each settings page has its own title.
- [x] The settings container is as wide as the rest of the app, and no table scrolls.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 458 tests.

## What review caught

**A status nobody anticipated deleted a key from the page.** `groupKeys` matched the four known
statuses exactly, and `jwt-keys.tsx` drew only those four groups — so a key with any other status
was in no group and rendered nowhere. `call()` only casts over `JSON.parse`, so one added upstream
status would have silently hidden a published signing key. There is now an `other` bucket, drawn in
the active table, and the test that asserted `statusBadge`'s fallback no longer implies a
degradation path the UI did not have.

**The clipboard write had no `.catch`.** `writeText` rejects when the document is not focused, and a
dropped rejection is a console error in production and the dev overlay in development. Both existing
in-menu copies in this repo already handle it; this one now matches them.

Smaller, all from the same pass:

- The revoked table called its timestamp "Last rotated at". It is when the key was *revoked*. The
  header is a prop now, so each table names the event it is actually showing.
- The key id was styled `uppercase` while the UUID is lowercase — and renders lowercase one tab
  away. Anyone reading it off the screen and typing it elsewhere would type a different string.
- `StatusPill` had copied the four tone strings out of `components/status.tsx` character for
  character. It is `Badge` plus `PILL` plus the tone now, like every other pill in the app.
- The kebab had no width, so it sized to a 28px icon button and long labels wrapped. `w-44`, the
  same as the table editor's menus.
- `onSelect` rather than `onClick`, matching the three menus already in the repo; the `disabled`
  guards on those items were unreachable and are gone.
- `describeAlgorithm("RS256")` claimed "RSA (2048)". The API accepts an imported `private_jwk` and
  `public_jwk` is not in this page's payload, so there is no modulus to check a number against. It
  says "RSA".
- `timeAgo` treated *any* future timestamp as clock skew, so a date a year ahead read "just now".
  Beyond five minutes it is bad data and gets the same dash as no value.
- The card label was an `<h3>` sitting above the page's `<h2>`s. It is a `<p>`; it was only ever
  styled as a label.
- The kebab's accessible name was a full UUID, read aloud character by character. It names the
  status instead.
- `general.tsx` still said "General settings" directly under the new "General" page title.

## The container was the real problem

Reported after the first parity pass looked right in isolation: the page sat in a narrow column with
most of the screen empty. `app/(app)/p/[ref]/settings/layout.tsx` used `max-w-3xl` — 768px — while
every other project page in the app uses `max-w-7xl`. Settings was the only exception, and narrower
than the rest by 40%.

It was not only empty space. The retired-keys table has five columns including a 36-character UUID,
so it did not fit in 704px of usable width. `ui/table.tsx` wraps itself in `overflow-x-auto`, so
rather than breaking, the table **scrolled its own status column out of view** — the badge saying
whether a key is retired or revoked was the first thing to disappear. A table that hides the column
you came to read is worse than one that wraps.

`max-w-7xl` fixes both. Nothing else needed adjusting: every input in the settings pages already
carries `max-w-xs`, and the code boxes use `flex-1 truncate`, so more width only means less
truncation.

## Two details from the original, added in the same pass

- **An icon in the type column**: a padlock for a key with a public half, a group for a shared
  secret. Not an open padlock — that would read as "less secure", and HS256 is not weaker, it is
  shared, which is a different thing and the one that decides what revoking it does.
- **A `(?)` tooltip** carrying `algorithmHint()`, which explains the distinction that matters: an
  asymmetric key publishes a public half anyone can verify against, a shared secret can only be
  checked by whoever holds it.
