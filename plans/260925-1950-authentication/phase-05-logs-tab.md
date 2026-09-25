---
phase: 5
title: "The Logs tab"
status: pending
priority: P3
effort: "3h"
dependencies: [2]
---

# Phase 5: The Logs tab

## Unblocked 2026-09-26

The endpoint this tab needs was removed upstream, and the two plans that fixed it have shipped:
[260925-2135-logs-endpoint-migration](../260925-2135-logs-endpoint-migration/plan.md) repointed
`queryLogs` at the replacement, and
[260925-2309-logs-exact-figures](../260925-2309-logs-exact-figures/plan.md) dealt with its
1000-row cap. `queryLogs` works; this phase can be built.

**One thing below is still unverified.** Filtering to a user means reading
`auth_audit_event.traits.user_id` out of `log_attributes`, and every attempt to reach into
`log_attributes` with a function was refused. Whether a plain comparison on a dotted key is
accepted was never measured — `like` on `event_message` is the fallback if it is not. Measure that
before writing the query, not after.

The rest of this section is the blocker as it stood, kept for the measurements in it.

## What was blocked, and on what

The user details panel's third tab shows that user's auth events. It could not be built, and the
reason was worth stating because it was larger than this tab.

**The logs endpoint this app uses has been removed.**

```
GET /v1/projects/{ref}/analytics/endpoints/logs.all
  410 "The logs.all endpoint has been removed. Use .../analytics/endpoints/logs instead."
```

`queryLogs` in `lib/mgmt-api.ts` calls `logs.all`. So the Logs page and every card that reads a log
source is returning an error today — not because of anything in this feature.

**And the replacement does not take the old table names.** `auth_logs`, `postgres_logs` and
`edge_logs` all answer `Table "…" does not exist.` The spec describes the new endpoint as *"all
project's logs in a single log stream"*, so the one-source-per-service model that `lib/logs-sql.ts`
is built around is gone. That is a module, not a line.

**It also throttles hard.** Twelve seconds between requests still answered
`ThrottlerException: Too Many Requests`, which is why measuring it is slow.

## What has to happen first

That work now has a plan of its own: [260925-2135-logs-endpoint-migration](../260925-2135-logs-endpoint-migration/plan.md).


Fixing `queryLogs` and `lib/logs-sql.ts` against the new endpoint is its own piece of work, with its
own measurement. It should not be folded into Authentication: it fixes a shipped feature that is
broken now, and this tab is a nice-to-have on a panel that is useful without it.

Once that is done, this phase is small: one query filtered to a user id, rendered as a list.

## The open question, answered

It carries one — in `auth_audit_logs`, not `auth_logs`.

`auth_logs` is GoTrue's application log: `component`, `level`, `msg`, and no user. `auth_audit_logs`
is the audit trail, and `log_attributes` flattens its nested JSON into dotted keys:

```
auth_audit_event.action                  "user_deleted"
auth_audit_event.actor_username          "service_role"
auth_audit_event.traits.user_id          "6d770d51-…"
auth_audit_event.traits.user_email       "superdb-probe-…@example.com"
```

So filtering to one user is a comparison on `auth_audit_event.traits.user_id`. The tab is buildable;
it is waiting on `queryLogs`, not on the data existing.

One caveat worth carrying: this project had **nine** audit rows against four thousand pgbouncer
ones. Retention is short, so an empty tab will be the common case and should read as "nothing
recently" rather than as a failure.
