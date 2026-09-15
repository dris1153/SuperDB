---
phase: 1
title: "Measure the baseline"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Measure the baseline

## Overview

Numbers before anything changes. The previous latency plan's phase 1 was never run, so "the page
feels slow" has never been a measurement, and neither will "it feels faster" be.

## Requirements

- Time to first byte, first contentful paint, and **time until each card has its data**, for
  `/p/[ref]` and `/p/[ref]/database`, on a real project with real connections.
- The same numbers again in phase 6, by the same method, on the same project.

## Architecture

Server timing is the honest part and it is already reachable: every Management API call goes through
`call()` in `lib/mgmt-api.ts`. Timing it there, behind an env flag, gives per-call durations without
guessing which one is slow. The browser side is DevTools' performance panel and the network waterfall.

Record: how long `resolveProject` takes (it fans out over connections), and the spread between the
fastest and slowest of the eight calls the overview page awaits — the second number is what the whole
page currently waits for.

## Related Code Files

- Read: `lib/mgmt-api.ts`, `lib/inventory.ts`, `app/(app)/p/[ref]/page.tsx`
- Create: a short note in `plans/reports/` with the numbers

## Implementation Steps

1. Instrument `call()` with an opt-in timing log.
2. Load both pages cold, three times each, on a project with more than one connection.
3. Write the numbers down, including which call is slowest.

## Result

[260915-0130-project-pages-baseline.md](../reports/260915-0130-project-pages-baseline.md).

The overview page waits **1201–2198 ms** for its fan-out plus **254 ms** for `resolveProject`; the
database page waits **875–941 ms** plus the same 254. The slowest calls are the read-only SQL query
(1201 ms) and metrics (1173 ms), with migrations third at 923 ms. `resolveProject` costs one round
trip rather than one per connection — it asks them in parallel.

Two things fell out of it that are worth doing regardless of this plan, and both are already phases
in `260910-0042-navigation-latency`: region alignment (these numbers are from Vietnam to
`api.supabase.com`) and caching the calls that rarely change.

## Success Criteria

- [x] Per-call durations recorded for both pages.
- [x] `resolveProject`'s own cost recorded separately — and corrected: it is parallel across
      connections, so it costs one round trip, not one per connection.
- [x] The slowest call on each page named.
- [x] Numbers are in a file, not in a message.
- [x] `SUPERDB_TIMING=1` logs every upstream call from the running app, for phase 6 to reuse.
- [ ] **Needs the app.** Browser-side paint numbers: TTFB, FCP, time-until-each-card.

## Risk Assessment

**Measuring a warm path.** The Management API and the browser both cache; a second load is not a
first load. Record cold loads, and say which they were.
