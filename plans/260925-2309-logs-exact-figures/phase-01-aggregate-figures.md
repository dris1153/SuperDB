---
phase: 1
title: "Figures from aggregates"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Figures from aggregates

## Overview

Stop deriving the cards' numbers from the 1000 rows the endpoint is willing to return. The numbers
come from `group by` counts, which the cap does not touch; the rows are kept only for the shape of
the bars.

## Requirements

- Every card's `total`, `warn` and `err` is a count over the whole window, not over a sample.
- No service can be crowded out of its own figures by a noisier one.
- The edge sources keep their status-based classification, and keep working if the server-side
  version of it is ever refused.
- The SQL builders and the merge stay pure and tested; nothing string-shaped moves into a component.

## Architecture

> **Built as two statements, not four.** The plan below called for one aggregate plus two `like`
> counts plus the sample, with the `like` counts allowed to fail. Measured while implementing:
> `sum(case when … then 1 else 0 end)` is accepted, so both status counts ride along in the
> aggregate itself and the fallback they needed does not exist. Two requests per read rather than
> four, and no optional-query branch. The rest of this section is what was planned; the shipped
> statement is in `buildFiguresSql`.

Four statements per read, issued together.

```sql
-- Q1  totals and the severity split, every card
select source, severity_text, count(*) as n
from logs
where source in ('edge_logs','auth_logs','postgres_logs','storage_logs','realtime_logs','function_edge_logs')
group by source, severity_text

-- Q2 / Q3  the HTTP sources, server errors then client errors
select source, count(*) as n
from logs
where source in ('edge_logs','function_edge_logs') and event_message like '% | 5__ | %'
group by source

-- Q4  the shape only
select source, severity_text, timestamp, event_message
from logs where source in (…) order by timestamp desc limit 1000
```

Q1 answers `total` for all six services, and `warn`/`err` for the four that speak severity. Q2 and
Q3 answer `warn`/`err` for edge and functions, whose severity is always `INFO`. Q4 fills buckets.

**Why `like` is trusted here.** It is the same dependency on the message format that
`statusFromMessage` already carries, checked against it: on 114 `edge_logs` rows the server counted
15 / 2 / 97 for `'% | 4__ | %'`, `'% | 5__ | %'`, `'% | 2__ | %'` and `classify()` returned
`warn 15, err 2, ok 97` for the same rows. Not an approximation of the parser — the same answer.

**Q2 and Q3 are allowed to fail.** `.catch(() => null)` on each, and a null falls back to counting
the edge split from the sample, which is what ships today. Q1 and Q4 are not allowed to fail: a page
that quietly serves partial figures is the failure this phase exists to remove.

**Sorting.** Cards sort by `total`, which is now exact, so the order stops changing with whatever
happened to be in the sample.

## Related Code Files

- Modify: `lib/logs-sql.ts` — `buildTotalsSql`, `buildStatusSql`, `figuresFor`, `toCards` signature
- Modify: `lib/project-parts.ts` — the `logs` reader issues four calls
- Modify: `lib/logs-sql.test.ts` — the builders, the merge, the fallback
- Unchanged: `classify`, `statusFromMessage`, `parseLogTime`, `successRate`, `SOURCE`

## Implementation Steps

1. `buildTotalsSql()` and `buildStatusSql(klass: "client" | "server")` beside `buildServiceLogsSql`,
   built from `SOURCE` so a service can never be in one statement and missing from another.
2. Rename `buildServiceLogsSql` to say what it is now — it returns a sample, not the data — and put
   the real cap in it: `limit 1000`, with a comment that the server enforces it regardless.
3. `figuresFor(totals, statuses, entries)` → `Record<ServiceKey, { total; warn; err }>`.
   - severity services: sum `n`, split by `ERROR_WORDS` / `WARN_WORDS`
   - edge and functions: `total` from Q1, `warn`/`err` from Q2+Q3, or from `entries` when those are
     null
4. `toCards(entries, window, figures)` keeps the bucketing it has and takes its headline numbers
   from `figures` instead of counting as it goes.
5. The `logs` reader issues all four, the optional two catching to null, and keeps the existing 429
   wording.
6. Tests, then `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
7. Verify against the live project: the card figures must equal a `count(*)` per source run on its
   own.

## Todo List

- [x] `buildTotalsSql` / `buildStatusSql`
- [x] the sample statement says 1000 and says why
- [x] `figuresFor`, including the null-statuses fallback
- [x] `toCards` takes figures
- [x] the reader issues four calls with the right two optional
- [x] tests for the builders, the merge and the fallback
- [x] live check against per-source `count(*)`

## Success Criteria

- [x] A card's `total` equals `select count(*) from logs where source = '…'` for the same window.
- [x] With the sample capped, no card reads zero for a service that has rows in the window.
- [x] Killing Q2 and Q3 leaves every number intact except the edge split, and raises no error.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` stay green.

## Risk Assessment

- **Four requests where there was one.** Measured: ten back-to-back went through and each answered
  in 1.4–3.6s. They are issued in parallel and the part still never retries.
- **`like` depends on the message format.** The same exposure `statusFromMessage` already has; if
  the format moves, both drift together rather than disagreeing with each other.
- **The bars will no longer sum to the headline.** Deliberate, and phase 2 is where the page says
  so. Until then the two figures disagree on screen with no explanation.
