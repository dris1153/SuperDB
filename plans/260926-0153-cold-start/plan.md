---
title: "Cold start: the 31 seconds nothing else in the latency plan is about"
status: blocked
created: 2026-09-26
blockedBy: []
blocks: []
---

# Cold start: the 31 seconds nothing else in the latency plan is about

Measured against the live deployment on 2026-09-26 and recorded in
[baseline.md](../260910-0042-navigation-latency/baseline.md):

```
GET /login                        cold  31.1 s     warm  361 ms
GET /api/projects/{ref}/logs      cold  59.2 s
```

[260910-0042-navigation-latency](../260910-0042-navigation-latency/plan.md) is about the ~800 ms a
warm page spends crossing the Pacific. That work is worth doing and it is not this: a user opening
the app after lunch waits **half a minute**, and no phase in that plan touches it.

## What the trace says

Next writes a file trace per route. Counting what each one drags in:

| Route | Traced files | of which Shiki |
|---|---|---|
| `(app)/p/[ref]/page` | **628** | **372** |
| `api/projects/[ref]/[part]/route` | **588** | **372** |
| every other route | ~145 | 0 |

Two routes are four times heavier than the rest of the app, and in both cases **63% of what they
carry is Shiki** — syntax-highlighting grammars and themes. They are also the two routes a user hits
first: the project overview, and the endpoint every card on it calls.

`lib/highlight.ts` imports `shiki` at module scope. The highlighter itself is already created
lazily, so nothing loads a grammar until something is highlighted — but the *import* is what the
bundler and the file tracer follow, and `lib/project-parts.ts` imports `highlight` for one part out
of twenty.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Shiki out of the hot path](phase-01-shiki-out-of-the-hot-path.md) | **completed** | ~1h | — |
| 2 | [Read the platform's own cold start number](phase-02-measure.md) | **blocked** | ~30m | 1 |

## How it turned out

Phase 1's hypothesis was wrong, and phase 1 says so rather than being rewritten to look right.

- A dynamic `import("shiki")` changed neither the trace (the tracer follows `import()` too) nor the
  local first-request time. Reverted.
- Counted in **bytes** instead of files, the two hot routes are 13.4 MB and 12.7 MB against ~2.6 MB
  for everything else, and Shiki is 10.4 MB of each. That is worth knowing and is not established as
  the cause.
- **`/login` traces 2.1 MB and was still 31 seconds cold.** Route size does not track cold start.

So the lever is not visible from this repository. Phase 2 is a dashboard read: Vercel reports init
duration per invocation, which splits platform boot from module evaluation from the handler — the
one split nobody here can infer.
