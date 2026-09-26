---
phase: 3
title: "Reveal"
status: in-progress  # code done and verified against the API; the UI needs the app
priority: P2
effort: "3h"
dependencies: [2]  # phase 1 is settled
---

# Phase 3: Reveal

## Overview

The eye icon on a secret row, and the sentence it prints when the API says no.

## Phase 1 settled this: the button works

`reveal=true` returns the secret complete where `reveal=false` returns it masked — measured on a
project inside the token's own organization. The 403s seen earlier were a token that could not reach
those projects, not a platform decision to withhold secrets.

So this is an ordinary feature with an ordinary failure path: a refusal means *this connection cannot
reach or is not permitted*, and the copy says that rather than "Forbidden".

**The length trap, which would otherwise ship.** A masked secret and a complete one are **both 41
characters**. Deciding "did we get the real key" by measuring the string is wrong in both directions:
it treats a mask as a key, and offers to copy 26 dots. Test for the mask character `·` (U+00B7), and
say why in a comment — the next person will reach for `.length` exactly as readily.

## Architecture

A server action, fetched on demand and never with the page — the pattern `getServerEnv` already uses
and states the reason for: a secret loaded eagerly sits in the payload of every page view whether or
not anyone asked for it.

**The revealed value is never cached, never audited, never logged.** `connection_events` is
append-only by policy — `lib/sql-redact.ts` records that it has `select` and `insert` and nothing
else — so a key that lands there can never be removed.

**403 is not an error state, it is an answer.** It renders as a sentence with a next step, not as red
text. The difference between "Forbidden" and "this connection lacks `api_gateway_keys_secret_read`"
is whether the reader knows what to do.

## What landed

- `lib/api-key-actions.ts` — `revealApiKey`, a server action fetched on demand.
- `lib/mgmt-api.ts` — `getApiKey`, one key rather than the whole list.
- `lib/api-keys.ts` — `isAddressableById`, with the measurement that forced it, plus 3 tests.
- `components/project-settings/api-keys.tsx` — the eye button, and local state that discards.

**A defect the measurement caught after the code was written.** The first version addressed every key
by id. Legacy keys carry an `id` of `"anon"` and `"service_role"` — their own names — so
`GET /api-keys/{id}` answers `400 {"message":"id: Invalid UUID"}` and Reveal would have silently
never worked for `service_role`, reporting a validation error as though the connection were at fault.
`isAddressableById` decides which of the two routes to take, and it is a tested pure function rather
than a regex inside an action the suite cannot reach.

**Two attempts, for two different reasons.** `secret` is masked unless the token may read secrets, so
it needs `reveal=true`. Legacy `service_role` is never masked — the list drops it deliberately —
so a refusal falls back to the plain read. Verified against the live API in that exact order:
`service_role` → 219 characters, `secret` → 41 characters, both unmasked.

**Local state, not a query cache.** A revealed key in TanStack would outlive the click that asked for
it and survive navigating away and back. Hiding discards it; a remount starts from nothing.

/p/[ref]/settings/api-keys 658,348 to 659,813 bytes.

## Success Criteria

- [x] A masked value is never presented as a key — detected by the mask character, not by length.
- [x] Reveal is fetched on demand, never with the page.
- [x] A refusal names what to change rather than saying "Forbidden", and is not styled as a failure.
- [x] The revealed value appears in no cache, no audit row, and no log line — it is held in component
      state and nowhere else, and reading a key is not a write.
- [x] Re-hiding discards it rather than hiding it in the DOM.
- [ ] **Needs the app.** The button, both states, and the refusal copy on a connection that lacks the
      permission.
- [x] `pnpm test` still green — 427, three of them new.

## Corrected after seeing it, 2026-09-25

Three things, and the first was a defect rather than a preference.

**The row was rendering `prefix` as though it were the key.** For the newer types a prefix really is
one — `sb_publishable_NeIMo` is the first 20 characters of that key. For the legacy pair it is an
unrelated identifier: `service_role`'s is `a5fKL` while the key itself begins `eyJhbGciOiJIUzI1`. On
screen that read as a short, complete key. `KeyRow` gained a `display` field that carries the API's
own mask where there is one — `sb_secret_plAo7` followed by dots, which the first version threw away
— and a fixed-width placeholder where there is nothing showable. Fixed width on purpose: matching the
real length would publish how long the key is, and the two legacy JWTs differ.

A **Hidden** line sits under such a row, so the state is read rather than inferred from a string
looking short.

**Hiding now conceals rather than discards, for sixty seconds.** Toggling inside that window costs no
round trip; the countdown runs from the *reveal*, not from the last hide, so clicking at it cannot
keep a key alive. The comment saying hiding discards was true and is now false, so it was rewritten —
leaving it would have been a lie in the one place someone would check.

**The code box becomes a skeleton while the reveal is in flight**, instead of a disabled button and
an unchanged string that looked like nothing was happening.

/p/[ref]/settings/api-keys 697,925 to 698,410 bytes.

## Risk Assessment

**A revealed secret is the most dangerous string this app handles**, and unlike a database password it
cannot be rotated by this app at all. On screen, in the clipboard, in a screenshot — those are the
exposures, and the page should be as sparing as the dashboard is.

**Reveal invites a second copy.** Whatever the button produces must not also land in component state
that outlives the reveal, or in a query cache, which is where a value quietly acquires a second life.
