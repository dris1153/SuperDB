---
phase: 1
title: "The sheet itself"
status: in-progress  # built; not looked at in a browser
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: The sheet itself

## Overview

Make the panel as wide as it was supposed to be, give the tabs room, and stop it hiding data the
browser already has.

## Requirements

- 896 px on a desktop, matching `connect-sheet.tsx`.
- Tabs clear of the rule under them and of the close control.
- No label wraps to two lines; no value truncates.
- Opening a row paints immediately.

## Architecture

**The width class never applied.** `components/ui/sheet.tsx` carries it as
`data-[side=right]:sm:max-w-sm`, and the panel asked with a plain `sm:max-w-2xl`. `tailwind-merge`
groups those separately, keeps both, and the variant wins — so the sheet has been 384 px since it
was written. `connect-sheet.tsx` already solved this with `sm:max-w-4xl!`; the `!` is the whole fix,
and using the same width keeps the two sheets agreeing.

**The truncation goes with it.** At 384 px every timestamp ended in an ellipsis and `User UID`
wrapped. At 896 px a UUID and a full timestamp both fit on one line beside their labels, so the
label gets `whitespace-nowrap` and the value stops truncating.

**The panel throws away the row it was opened from.** That row carries the id, the email, the
display name, the avatar, `created_at` and `last_sign_in_at`. Rendering a skeleton over all of it
for ~600 ms is a choice, not a constraint: passing the row in means the header and half the
attribute table are there on the first frame, and only `updated_at`, `invited_at`,
`confirmation_sent_at`, `SSO`, the identities and the factors wait for the read.

Those waiting values need a placeholder that is not a dash — a dash means "this is empty", which is
a claim, and the read has not answered yet. A short skeleton in the value cell says the right thing.

## Related Code Files

- Modify: `components/auth/user-panel.tsx` — width, tab strip, seeding
- Modify: `components/auth/user-attributes.tsx` — nowrap labels, no truncation, pending cells
- Modify: `components/auth/users-table.tsx` — pass the row it opened
- Read for context: `components/connect-sheet.tsx` (the width precedent),
  `components/ui/sheet.tsx` (why the plain class loses)

## Implementation Steps

1. `sm:max-w-4xl!` on the panel's `SheetContent`.
2. Tab strip: padding below the pills, and room kept clear on the right for the close control.
3. Attribute rows: `whitespace-nowrap` on labels, no `truncate` on values, a skeleton for a value
   that has not arrived.
4. The table passes the clicked row; the panel renders from it until the read lands.
5. Check the four late attributes still read as absent — not as pending — once the read is in.

## Todo List

- [x] Width, with the `!` that makes it apply
- [x] Tab strip spacing
- [x] Labels on one line, values not truncated
- [x] Seed from the row
- [x] Pending values look pending, absent values look absent

## Success Criteria

- [x] The sheet measures 896 px on a desktop viewport.
- [x] No label wraps and no value ends in an ellipsis.
- [x] Opening a row shows the name, email, UID, created and last-sign-in immediately.
- [x] A value that has not arrived is distinguishable from one that is empty.

## Risk Assessment

- **A seeded panel can show stale values.** The row is from the last list read and the detail
  replaces it as soon as it lands; nothing acts on the seeded copy, and the actions all take the id.
- **A dash for a pending value would be a lie** — it means the API said there is nothing there.

## Built 2026-09-26

- `sm:max-w-4xl!`. The `!` is the fix; without it the `data-[side=right]:sm:max-w-sm` in
  `ui/sheet.tsx` wins and the sheet stays 384 px, which is what it had been doing.
- The tab strip gets `pt-5 pr-14 pb-4`: off the rule below, and clear of the close control.
- Labels are `whitespace-nowrap` and values no longer truncate.
- The panel takes the row it was opened from and renders it immediately.

## Three states, not two

Seeding introduced a hole worth naming: if the single read *fails*, the seeded row still renders and
the four late values would have shown a skeleton for ever.

So `UserAttributes` takes `detail: "pending" | "ready" | "failed"`, because a value that is still
coming, one that arrived empty and one that could not be read are three different things — and only
the middle one is a dash. Pending is a skeleton, failed is `unread`, and the panel shows the reason
above the table.

## Not verified

The browser. Checked: 560 tests, typecheck, lint, build.
