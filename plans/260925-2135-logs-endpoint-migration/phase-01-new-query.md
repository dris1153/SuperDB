---
phase: 1
title: "The new query shape"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: The new query shape

## Overview

Point `queryLogs` at the endpoint that exists, and rewrite the statement for one table with a
`source` column and flat attributes.

## Requirements

- The Logs page and the service cards return data again.
- Each service keeps the severity vocabulary it actually uses.
- The eight tests that cover `toCards` and friends keep passing untouched.

## The first step is a measurement

**How a dotted key is addressed in this SQL is unmeasured.** `response.status_code` is a key
containing a dot, not a nested field, so the two candidates are:

```sql
log_attributes['response.status_code']
log_attributes.`response.status_code`
```

Try both against a live project before writing the builder around either. Leave seventy seconds
between attempts — this endpoint throttles at roughly six requests and does not clear in twelve.

If neither works, the fallback is `event_message`, which carries `DELETE | 204 | …` for edge rows.
That is string parsing and worse, so it is a fallback rather than a plan.

## Architecture

**`queryLogs` changes endpoint and nothing else.** The envelope is the same — `{result, error}` with
`error` populated on a 200 — so its one real behaviour, reading the envelope rather than the status
line, is already right. Only the path moves, and the `MgmtError` message should stop saying
`logs.all`.

**The statement collapses from six branches to two.** What was three shapes (HTTP status, log level,
Postgres severity nested deeper) is now:

```sql
-- five sources, from severity_text
select source as service, timestamp_trunc(timestamp, {unit}) as bucket,
  countif(severity_text in ("ERROR","FATAL","PANIC")) as err,
  countif(severity_text in ("WARNING","WARN")) as warn,
  count(*) as total
from logs
where source in ("auth_logs","postgres_logs","storage_logs","realtime_logs","postgrest_logs")
group by service, bucket

union all

-- edge, whose status never reaches severity_text
select "edge_logs" as service, timestamp_trunc(timestamp, {unit}) as bucket,
  countif(<status> >= 500) as err,
  countif(<status> >= 400 and <status> < 500) as warn,
  count(*) as total
from logs where source = "edge_logs"
group by bucket
```

`service` is now the source name, so the mapping from source to `ServiceKey` moves into the builder
or into `toCards`'s lookup — one place, not scattered.

**`SERVICES` needs revisiting.** It lists six keys including `functions`, and `function_edge_logs` is
not among the eight sources this project has. Either Edge Functions land in `edge_logs`, or they
appear only on a project that has functions. Do not silently drop the card: measure, and if it
cannot be answered, keep the card and let it read as idle, which is what it does today for a service
with no traffic.

## Related Code Files

- Modify: `lib/mgmt-api.ts` — `queryLogs`, the path and the error text
- Modify: `lib/logs-sql.ts` — the branches, and the source-to-service mapping
- Modify: `lib/logs-sql.test.ts` — the two tests that assert on the statement's text
- Unchanged: `lib/project-parts.ts`'s `logs` reader, which composes the same pieces

## Implementation Steps

1. Measure the dotted-key syntax. Nothing else starts until that is known.
2. `queryLogs`: the new path, and a message that names it.
3. Rewrite `buildServiceLogsSql` as the two branches above, with the source list as data rather than
   six function calls.
4. Map source names to `ServiceKey` in one place.
5. Rewrite the two statement tests: one that every service is covered, one that each source's
   vocabulary is the one measured for it.
6. Verify against a live project — the page is the test here, since the suite cannot reach the API.

## Success Criteria

- [x] The Logs page renders data rather than an error.
- [x] A service with errors shows them; the classification matches the measured vocabulary.
- [x] The eight untouched tests still pass, unedited.
- [x] No reference to `logs.all` remains.

## Risk Assessment

- **The dotted-key syntax may not work at all**, in which case edge's error and warning counts come
  from parsing `event_message` or are dropped with the card saying the classification is unavailable.
  Dropping is better than a zero that looks like health.
- **Retention is short.** Nine audit rows against four thousand pgbouncer ones on this project, so a
  window with no data is normal and must not read as a failure.
