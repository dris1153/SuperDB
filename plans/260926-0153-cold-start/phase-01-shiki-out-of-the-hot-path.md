---
phase: 1
title: "Shiki out of the hot path"
status: completed  # attempted, measured, and reverted — the hypothesis did not hold
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Shiki out of the hot path

## What this phase believed

That two routes carrying 372 files of syntax-highlighting grammar was the cold start, and that a
dynamic `import("shiki")` inside `lib/highlight.ts` would take it off their trace.

## What happened

**The trace did not move.** Next's file tracer follows `import()` as faithfully as `import` — it has
to, since the module is reachable at runtime either way. Before: 628 and 588 files on the two hot
routes. After: 629 and 589.

**Neither did the time.** `next start`, first request to `/api/projects/[ref]/[part]`, three runs
each:

```
static import    64ms, 72ms, 80ms     then 3-6ms warm
dynamic import   67ms, 69ms, 162ms    then 3-9ms warm
```

The change was reverted. An unproven change carrying a comment that claims a benefit is worse than
no change.

## What the measurement did establish

Counting **bytes** rather than files, which is what the platform has to fetch and unpack:

| Route | Traced MB | of which Shiki |
|---|---|---|
| `(app)/p/[ref]/page` | **13.4** | **10.4** |
| `api/projects/[ref]/[part]/route` | **12.7** | **10.4** |
| every other route | ~2.6 | 0 |

The two routes a user touches first are five times the size of the rest of the app, and four fifths
of that is Shiki: the overview page reaches it through the Connect panel's snippets, the part route
through the `definition` reader's DDL highlighting. That is real and worth knowing.

## Why it is probably not the cold start anyway

`/login` traces **2.1 MB and 122 files** — the smallest page in the app — and its cold start was
**31 seconds**, against 59 for the heavy part route. A 6× difference in bytes did not produce a 6×
difference in cold start, and the light page was nowhere near fast.

Whatever costs thirty seconds is mostly **not** proportional to what the route carries. Guessing
further from here would be the same mistake this phase already made once.

## What would settle it

Vercel reports its own init duration per invocation, in the function logs. That number separates
platform boot from module evaluation from the work the handler does, which is exactly the split
nobody here can infer. It is a dashboard read, not a code change.
