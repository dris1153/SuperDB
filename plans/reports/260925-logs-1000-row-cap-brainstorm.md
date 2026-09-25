# Logs: the 1000-row cap, and what the endpoint can actually do

Measured 2026-09-25 against project `nnjdwpswuynozmzfaioc`, 24-hour window, after the
[logs endpoint migration](../260925-2135-logs-endpoint-migration/plan.md) shipped.

## Problem

The migrated statement ends `limit 5000`. That number never took effect.

```
limit 5000  -> 1000 rows, 223 KB
limit 10000 -> 1000 rows, 223 KB
limit 50000 -> 1000 rows, 223 KB
```

**The cap is 1000 rows, server side, whatever the statement asks for.**

Worse than undercounting: `order by timestamp desc` runs across all six sources at once, so the
services compete for those 1000 slots. The measured project writes a Postgres checkpoint line every
~15 seconds; on a busier one that traffic alone fills the sample and a card reads `total = 0` for a
service that was serving requests the whole time. A figure that is low is a bug; a figure that is
zero is a lie.

Not hypothetical at this size: 6088 rows in 24 hours on a project with no users. `pgbouncer_logs`
accounted for 5570 of them and is already excluded, which is the only reason the cards work today.

## What the endpoint supports (the earlier "almost no SQL" was too broad)

The previous round concluded the endpoint refuses nearly everything. It refuses `countif`,
`timestamp_trunc`, `cast` and `starts_with` — but those are not representative:

| Tried | Result |
|---|---|
| `group by source, severity_text` + `count(*)` | works, 15 rows, unaffected by the cap |
| `where severity_text = 'ERROR'` | works |
| `like '% \| 5__ \| %'`, including the `_` wildcard | works |
| `offset 1000` | works — there is a real second page |

**Aggregates are not capped.** A `group by` answers over the whole window, because the cap is on
rows returned, not rows scanned. That is the whole solution.

### The `like` count matches the message parser exactly

114 `edge_logs` rows in the window. Classified by the shipped `classify()`: `ok 97, warn 15, err 2`.
Counted by the server:

```
like '% | 4__ | %'  ->  15
like '% | 5__ | %'  ->   2
like '% | 2__ | %'  ->  97
```

Identical. So API Gateway's error split can be exact rather than inferred from a sample.

### Severity vocabulary, confirmed

`INFO`, `LOG`, `WARN`, `WARNING`, `ERROR`, `FATAL`. `ERROR_WORDS` and `WARN_WORDS` in
`lib/logs-sql.ts` already cover all of them.

## Approaches considered

| | Requests | Totals | Bars |
|---|---|---|---|
| **A. Aggregate for the figures, sample for the shape** | 4, parallel | exact | sampled, labelled |
| B. One raw query per service | 6 | still capped at 1000 each | consistent with the figures |
| C. Keep one query, label it honestly | 1 | wrong on a busy project | consistent |

B removes the starvation but not the undercount, and costs more requests than A to stay wrong.
C is the cheapest honest option, and was rejected because Total Requests and Success Rate are the
reason the panel exists — on the projects where they matter most, they would be the numbers that
break.

**Chosen: A, with the bars drawn from the sample and labelled.**

## Design

Four statements, issued in parallel, one window each.

```sql
-- Q1  exact totals and the severity split, for every card
select source, severity_text, count(*) as n
from logs
where source in ('edge_logs','auth_logs','postgres_logs','storage_logs','realtime_logs','function_edge_logs')
group by source, severity_text

-- Q2  the two HTTP sources, server errors     (like '% | 5__ | %')
-- Q3  the two HTTP sources, client errors     (like '% | 4__ | %')
select source, count(*) as n from logs
where source in ('edge_logs','function_edge_logs') and event_message like '…'
group by source

-- Q4  the shape of the traffic over time
select source, severity_text, timestamp, event_message
from logs where source in (…) order by timestamp desc limit 1000
```

- Q1 gives `total` for all six, and `warn`/`err` for auth, postgres, storage and realtime.
- Q2 and Q3 give `warn`/`err` for edge and functions, whose severity is always `INFO`.
- Q4 fills the buckets. Its counts are no longer the card's figures — only its distribution is used.

**Q2 and Q3 are allowed to fail; Q1 and Q4 are not.** If `like` stops being accepted, the edge split
falls back to what the sample says and every other number stays exact. A failure of Q1 or Q4 fails
the part, as today — a page that silently drops to partial data is the bug this whole report is
about.

### Saying that the bars are a sample

Q4 returning exactly 1000 rows means the window was cut. The oldest timestamp in the sample is where
the bars actually begin, so the panel can say it:

> Bars cover the last 12 minutes. Totals cover the full window.

Without that line the bars and the headline disagree and nothing on screen explains why.

### Shape

`readPart("logs")` returns `{ from, to, cards, sampledFrom: number | null }`. `toCards` takes the
exact per-service figures alongside the sampled entries instead of deriving the figures from them.

## Risks

- **Four requests where there was one.** Measured: ten back-to-back queries were not throttled, and
  each answers in 1.4–3.6s. They go out in parallel, and the part still never retries.
- **The `like` pattern depends on the message format**, exactly as the client-side parser already
  does — the same risk, not a new one, and it is checked against the parser above.
- **The bar sum will not equal the headline.** That is the point of the label; without the label it
  reads as a bug.

## Also affected

The Authentication feature's Logs tab (phase 5 of
[260925-1950-authentication](../260925-1950-authentication/plan.md)) reads the same endpoint and
will meet the same cap.

## What changed when it was built

Two of this report's conclusions did not survive implementation, both measured:

- **`sum(case when … then 1 else 0 end)` is accepted.** The four-statement design above exists only
  because this was not tried. One aggregate answers the totals, the severity split and both status
  counts, so the read is two requests — the aggregate and the sample — and the "these two may fail"
  fallback was never needed.
- **"Ten back-to-back were not throttled" was the wrong reassurance.** Twelve go through; around
  twenty in a burst returns `429 ThrottlerException`, clearing somewhere between 20 and 60 seconds.
  The 429 body carries `message` rather than `error`, so a reader checking `error` and then
  `result.length` mistakes a refusal for an empty window — which is exactly what one of these
  probes did before it was corrected.

Shipped as [260925-2309-logs-exact-figures](../260925-2309-logs-exact-figures/plan.md).
