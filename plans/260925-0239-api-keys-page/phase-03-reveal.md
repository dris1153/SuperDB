---
phase: 3
title: "Reveal"
status: pending
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

## Success Criteria

- [ ] A masked value is never presented as a key — detected by the mask character, not by length.
- [ ] Reveal is fetched on demand, never with the page.
- [ ] A 403 names the missing scope and what to do, and is not styled as a failure.
- [ ] The revealed value appears in no cache, no audit row, and no log line.
- [ ] Re-hiding actually discards it rather than hiding it in the DOM.
- [ ] `pnpm test` still green.

## Risk Assessment

**A revealed secret is the most dangerous string this app handles**, and unlike a database password it
cannot be rotated by this app at all. On screen, in the clipboard, in a screenshot — those are the
exposures, and the page should be as sparing as the dashboard is.

**Reveal invites a second copy.** Whatever the button produces must not also land in component state
that outlives the reveal, or in a query cache, which is where a value quietly acquires a second life.
