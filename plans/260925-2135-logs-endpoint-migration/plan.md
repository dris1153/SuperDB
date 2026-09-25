---
title: "Logs: migrate to the endpoint that still exists"
status: completed
created: 2026-09-25
blockedBy: []
blocks: [260925-1950-authentication]
---

# Logs: migrate to the endpoint that still exists

The Logs page and every service card are returning an error, and have been since Supabase removed
the endpoint they call. This fixes that.

```
GET /v1/projects/{ref}/analytics/endpoints/logs.all
  410 "The logs.all endpoint has been removed. Use /v1/projects/{ref}/analytics/endpoints/logs
       instead."
```

`queryLogs` in `lib/mgmt-api.ts` calls `logs.all`. Nothing in this repo caused it; the API changed
under a working feature.

Measured 2026-09-25 against a live project, recorded in
[260925-auth-api-measured.md](../reports/260925-auth-api-measured.md) — found while checking whether
the Authentication feature's user Logs tab was buildable, which is why the measurement lives in that
report rather than one of its own.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The new query shape](phase-01-new-query.md) | completed | ~4h | — |
| 2 | [What the page shows when logs are empty or throttled](phase-02-empty-and-throttled.md) | completed | ~2h | 1 |

## What changed upstream

**One stream, not one table per service.** The old model was `auth_logs`, `postgres_logs`,
`edge_logs` — each with its own nested `metadata` to unnest. All of them now answer
`Table "…" does not exist.`

The replacement takes SQL over a single table called `logs`, where the service is a **column**:

```sql
select count(*) as n from logs                      -- 200, {"result":[{"n":3279}]}
select id, timestamp, event_message                 -- error: needs a FROM
```

A row:

```json
{"event_message": "…", "id": "…", "severity_text": "INFO",
 "source": "pgbouncer_logs", "timestamp": "…", "log_attributes": {…}, "project": "…"}
```

Eight sources exist, keeping their old names as values: `pgbouncer_logs`, `auth_logs`, `edge_logs`,
`storage_logs`, `postgrest_logs`, `postgres_logs`, `realtime_logs`, `auth_audit_logs`.

**`metadata` is gone; `log_attributes` is flat.** What was
`cross join unnest(t.metadata) m cross join unnest(m.response) r` reading `r.status_code` is now a
key named `response.status_code` — a dotted key, not a nested field.

## What this does not change

`successRate`, `asInterval`, `bucketUnit` and `windowMinutes` never touch the API and are untouched.

**`toCards` was not as separable as this said.** It took `LogRow` — one pre-aggregated row per
service per bucket, which only the old query could produce. With the aggregation moved into it, its
input is now `LogEntry`, so the six tests that build rows were rewritten around raw entries. Their
assertions are the same ones; only the fixtures changed.

## Settled decisions

- **Five sources classify from `severity_text`; edge does not.** Measured: `edge_logs` is only ever
  `INFO`, including a row whose message is `DELETE | 204`. So one shared branch covers auth,
  postgres, storage and realtime, and edge reads a status of its own.
- **That status comes from the message, not from `log_attributes`.** Reaching into the attributes
  needs a function — `cast`, `starts_with`, anything — and every function tried was refused. The
  message's `VERB | status | …` shape is parsed instead, and a message that does not match counts as
  a success rather than painting a card red on a format nobody promised.
- **`function_edge_logs` is not among the eight sources.** Whether Edge Functions land in
  `edge_logs` or are simply absent on a project with no functions is unmeasured, and phase 1 says so
  rather than guessing.
- **This endpoint throttles, on a shape this plan got wrong.** Ten identical queries back to back
  went through untouched (measured 2026-09-25, after the migration), while the earlier run of varied
  probes was still refused with seventy seconds between them. The limit is real; "six requests" is
  not it. The page still must not retry into it, and now does not.
