---
phase: 3
title: "Reveal"
status: pending
priority: P2
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Reveal

## Overview

The eye icon on a secret row, and the sentence it prints when the API says no.

## What this phase can promise depends on phase 1

Measured: `reveal=true` → **403**, *"Your account does not have the necessary privileges"*, on a
healthy project with a PAT, for every truthy spelling and on both endpoints. Research names the gate:
`api_gateway_keys_read` **and** `api_gateway_keys_secret_read`.

Phase 1 settles which of these the copy says:

- **A full-access PAT succeeds** → the button works for connections that carry the scope, and the 403
  path names the missing scope and how to add it.
- **It still fails** → the button reports an upstream limitation with a link, and says so plainly
  rather than implying the user did something wrong.

Either way **the button exists and calls the API**. A permanently disabled control would turn a token
problem into what looks like a missing feature.

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
