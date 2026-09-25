# Logs, and the endpoint they come from

The service cards on the project overview — API Gateway, Auth, Postgres, Storage, Realtime, Edge
Functions — read a project's logs through the Management API's analytics endpoint. Almost everything
about that endpoint is surprising, and the code implementing it looks wrong without the reasons
below.

Modules: [`lib/logs-sql.ts`](../lib/logs-sql.ts) (pure, tested), the `logs` reader in
[`lib/project-parts.ts`](../lib/project-parts.ts), `queryLogs` in
[`lib/mgmt-api.ts`](../lib/mgmt-api.ts), and
[`components/project-overview/usage-panel.tsx`](../components/project-overview/usage-panel.tsx).

## One stream, not one table per service

The endpoint this app used, `analytics/endpoints/logs.all`, was **removed upstream**. It answers 410
with a pointer to `analytics/endpoints/logs`, and every card that read a log source had been showing
an error until this was migrated.

The replacement is not the same model. The old one had a table per service — `auth_logs`,
`postgres_logs`, `edge_logs` — each with a nested `metadata` to unnest. All of those now answer
`Table "…" does not exist.` There is one table, `logs`, and the service is a **column**:

```sql
select count(*) as n from logs where source = 'auth_logs'
```

Eight sources exist, keeping their old names as values: `pgbouncer_logs`, `auth_logs`, `edge_logs`,
`storage_logs`, `postgrest_logs`, `postgres_logs`, `realtime_logs`, `auth_audit_logs`.
`function_edge_logs` was **not** among them on the measured project, which has no Edge Functions, so
whether that is the right name is unverified. A source matching no rows leaves its card reading as
idle rather than breaking anything.

`pgbouncer_logs` is excluded from every statement deliberately: 5570 rows of the 6088 in a measured
day, and no card shows it.

## What the endpoint accepts, and what it refuses

An early round concluded it "supports almost no SQL". That was drawn from four refusals and is too
broad. Measured, one feature at a time, from a statement known to answer:

| | |
|---|---|
| `group by`, `count(*)` | works |
| `sum(case when … then 1 else 0 end)` | works |
| plain comparisons, `like` with `_` and `%` | works |
| `offset`, `order by` | works |
| `log_attributes['dotted.key']` | works |
| `countif(…)` | refused |
| `timestamp_trunc(…)` | refused |
| `cast(…)`, `starts_with(…)` | refused |
| ``log_attributes.`dotted.key` `` | refused |

Every refusal is the same sentence — `Backend error! Retry your query. Please contact support if
this continues.` — which names nothing, so each of these was established by elimination rather than
read off an error message. **Assume nothing about a function until it has been tried.**

A failure arrives as **HTTP 200 with `error` populated**, so `queryLogs` reads the envelope rather
than trusting the status line.

## The 1000-row cap, and why the figures are aggregates

A raw select returns at most **1000 rows**, whatever the statement asks for:

```
limit 5000  -> 1000 rows       limit 10000 -> 1000 rows       limit 50000 -> 1000 rows
```

This is the single most important fact on the page, because the failure it causes is not "numbers
are a bit low". `order by timestamp desc` ranks all six sources together, so they compete for those
1000 slots — one chatty source takes the sample and a quiet one reports **zero requests** for a
service that was serving traffic the whole time. The measured project writes a Postgres checkpoint
line every fifteen seconds; a busier one would starve the rest.

**The cap is on rows returned, not rows scanned, so an aggregate escapes it.** That is the whole
design:

- One `group by source` aggregate answers every card's total and its error split — severity columns
  for the four sources that emit levels, `like` counts of the HTTP status for the two that do not.
  Never truncated.
- One raw read of 1000 rows gives the *shape* of the traffic over time. Its counts are not the
  card's figures; only its distribution is used.
- When that read comes back full, the window was cut, and the panel says which range the bars
  actually cover. Without that line the bars and the headline disagree with nothing to explain why.

`edge_logs` is only ever `INFO`, including a row reading `DELETE | 204 | …`, so severity cannot
classify it. The status is parsed out of the message — a format nobody promised, so a message that
does not match counts as a success rather than painting a card red. The server-side `like` counts
were checked against that parser rather than assumed: on 114 edge rows both answered 15 client
errors, 2 server errors, 97 successes.

## Timestamps carry no zone

`2026-09-25T12:49:33.481143`. `new Date()` reads that as **local** time, which in Vietnam puts the
last seven hours of logs in the future and shifts every bucket. They are UTC; `parseLogTime` appends
the `Z`.

## Throttling

The endpoint answers `429 ThrottlerException: Too Many Requests` under load, and its shape is not
what an early note claimed. "Roughly six requests exhausts it" is wrong: twelve went through, and
around twenty in a burst was refused. It cleared between twenty and sixty seconds later.

Two things follow:

- **Nothing retries into it automatically.** The `logs` part is read with `retry: 0`, and a 429 is
  reported as rate limiting in words a reader can act on rather than as `ThrottlerException`.
- **A 429 body uses `message`, not `error`.** A reader that checks `error` and then `result.length`
  sees zero rows and reports an empty window — which is exactly what one probe did before it was
  corrected. An empty result and a refusal must not be confused.

One statement in about twenty answered `Backend error! Retry your query` for no reason, under a
parallel fan-out, on a query that answers every other time. The card shows the reason and a reload
fixes it.

## What was believed and turned out false

- **"`limit 5000` bounds the read."** It never did; 1000 arrive.
- **"Six requests exhaust the throttle."** Twelve do not.
- **"The endpoint supports almost no SQL."** It supports `group by`, `sum(case …)`, `like` and
  `offset` — enough to move the whole aggregation server-side.
- **"`toCards` is independent of the query."** It took one pre-aggregated row per service per
  bucket, which only the old query could produce.
