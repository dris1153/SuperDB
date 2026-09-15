---
phase: 6
title: "Measure again, and the states nobody looks at"
status: in-progress
priority: P1
effort: "2h"
dependencies: [4, 5]
---

# Phase 6: Measure again, and the states nobody looks at

## Overview

The same measurement as phase 1, and a pass over every state that is not the happy path.

## Requirements

- Before/after numbers by the same method, on the same project.
- Every card's pending, settled, refused and failed states seen at least once.
- No token or raw envelope in any response body.

## Architecture

The honest comparison is not "is it faster" — client fetching moves work after hydration, so
time-to-data is expected to be *worse* and time-to-first-paint better. Record both, and say which
moved which way rather than reporting whichever number improved.

Throttle the network to see the states: a fast connection hides every skeleton.

## Related Code Files

- Read: the phase 1 note
- Create: the after-numbers in the same file

## Implementation Steps

1. Re-run phase 1's measurement.
2. Throttle and walk both pages: pending, settled, refused, network failure, expired session.
3. Read the response bodies for a token or an upstream envelope.
4. Record the result, including anything that got worse.

## What the re-run said

Recorded in [the phase 1 note](../reports/260915-0130-project-pages-baseline.md), under **After**,
so the before and the after sit in one file.

- **The upstream fan-out did not move**, and the table says so: 1201–2198 → 799–1203 ms on the
  overview, 875–941 → 834–1259 ms on the database page. Those are the same calls, and the ranges
  overlap — reading either direction as an effect of this plan is reading noise.
- **What moved is what the server waits for before it sends anything.** All four page components now
  await `resolveProject` and nothing else: 1455–2452 ms → 359 ms on the overview, 1129–1195 ms →
  359 ms on the database page.
- **Time-to-data got later, not earlier**, and every page got bigger — both written down beside the
  improvement rather than under it.
- **The bodies were read by something that runs.** `scripts/probe-part-secrets.mjs` scans each
  pass-through part's upstream body for a PAT, an `sb_secret_` key, a JWT or a connection string with
  a real password, and prints field *paths* — a probe that echoes a secret to prove it is there has
  published it. Every pass-through part is clean; `api-keys` still carries a live JWT at
  `reveal=false`, which is why that reader picks its fields and `KeySummary` is branded.

## Success Criteria

- [x] Before and after numbers in one place, with the server-side wait and the upstream fan-out both
      recorded, and the variance called out rather than spent.
- [ ] **Needs the app.** Every card seen in all four states with the network throttled.
- [x] No token and no raw envelope in any body: the pass-through parts are scanned by a probe, the
      picking readers are enforced by their return types, and `describe()` forwards only the upstream
      `message` rather than the `path → status {envelope}` string that is thrown.
- [ ] **Needs the app.** A revisit inside the stale window issuing no new requests, in the network
      panel.
- [x] Anything that got worse is written down: later data, nine requests where there was one document,
      and the first-load bytes on all four routes.

## Risk Assessment

**Reporting only the number that improved.** First paint will improve and time-to-data will not. Both
belong in the note, or the next person re-opens this decision without the facts.
