---
title: "Logs: exact figures under a 1000-row cap"
status: completed
created: 2026-09-25
blockedBy: []
blocks: []
---

# Logs: exact figures under a 1000-row cap

The service cards read their figures from a sample they do not know is a sample.

```
limit 5000  -> 1000 rows
limit 10000 -> 1000 rows
limit 50000 -> 1000 rows
```

The endpoint caps every raw select at **1000 rows**. The statement shipped by
[the migration](../260925-2135-logs-endpoint-migration/plan.md) asks for 5000 and always got 1000,
so on any project busier than the one available to measure the totals are low — and because
`order by timestamp desc` ranks all six sources together, a chatty source takes the whole sample and
a quiet one reads `total = 0` while it was serving requests.

Measured 2026-09-25 and written up in
[260925-logs-1000-row-cap-brainstorm.md](../reports/260925-logs-1000-row-cap-brainstorm.md).

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Figures from aggregates](phase-01-aggregate-figures.md) | completed | ~3h | — |
| 2 | [Saying the bars are a sample](phase-02-sample-label.md) | completed | ~1h | 1 |

## The opening this rests on

The previous round concluded this endpoint "supports almost no SQL". That was drawn from four
refusals — `countif`, `timestamp_trunc`, `cast`, `starts_with` — and is too broad. Measured since:

| Tried | Result |
|---|---|
| `group by source, severity_text` + `count(*)` | works, and **the cap does not apply** |
| `where severity_text = 'ERROR'` | works |
| `like '% \| 5__ \| %'`, `_` wildcard included | works |
| `offset 1000` | works |
| `sum(case when … then 1 else 0 end)` | works — found late, and it halved the request count |

The cap is on rows returned, not rows scanned, so an aggregate answers over the whole window. That
is the entire fix: the figures stop coming from the rows.

## Settled decisions

- **Two statements, in parallel — revised down from four during implementation.** `sum(case when …
  then 1 else 0 end)` turned out to be accepted, so the aggregate answers the totals, the severity
  split and both status counts by itself. The two separate `like` queries, and the fallback they
  needed when they failed, were never built.
- **The `like` counts are not an approximation.** On 114 `edge_logs` rows the server's
  `'% | 4__ | %'`, `'% | 5__ | %'` and `'% | 2__ | %'` counts came to 15 / 2 / 97, which is what
  `classify()` returns for the same rows, exactly.
- **Neither statement may fail.** Both are required; a page quietly serving figures from part of
  the window is the bug this plan exists to fix. Halving the request count is what makes that
  affordable.
- **The bars stay sampled and get told on.** Their sum will not match the headline, and the only
  thing that makes that readable is a line naming the range the bars really cover.

## Also affected

The Authentication feature's Logs tab (phase 5 of
[260925-1950-authentication](../260925-1950-authentication/plan.md)) reads this endpoint and meets
the same cap. Out of scope here; worth knowing before that phase is written.

## Measured while implementing

- **Every card now equals its own count.** Against the live project, each card's total matched
  `select count(*) from logs where source = '…'` run separately: 114 / 120 / 76 / 98 / 17 / 0.
- **The throttle sits near 20 requests in a burst.** Twelve went through, and the next round came
  back `429 ThrottlerException`. It cleared between 20 and 60 seconds later, and the 429 body says
  `message`, not `error` — a probe reading `result.length` sees zero rows and calls a refusal an
  empty window. Two requests per read rather than four leaves twice the headroom.
- **One statement in about twenty came back `Backend error! Retry your query` for no reason.**
  Seen once, under a parallel fan-out, on a statement that answers every other time. Nothing
  retries into it; the card shows the reason and a reload fixes it.
