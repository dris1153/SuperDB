---
phase: 3
title: "The Logs tab"
status: in-progress  # built and verified against the live project; not looked at in a browser
priority: P3
effort: "2h"
dependencies: [2]
---

# Phase 3: The Logs tab

## Overview

The original lists a user's API requests. Ours lists audit events. Both exist, and the original
shows both.

## Architecture

**The claim that ruled this out was wrong.** `docs/authentication.md` says `auth_logs` "carries no
user id, so it cannot answer what did this user do". Measured 2026-09-26 against
`kupekvmyzqypwrtnjlid`:

```
select count(*) from logs
where source = 'auth_logs' and log_attributes['user_id'] = '91983d71-…'    ->  13
```

And the columns the original's table shows are selectable directly:

```
select log_attributes['status'], log_attributes['path'], log_attributes['msg'] …
  ->  {"msg":"request completed","path":"/user","status":"200"}
```

The earlier claim came from reading a few rows' top-level message fields and generalising from them.

**The original merges two sources.** One row in its list reads `| Login` with no status and no path
— an `auth_audit_logs` row among the request rows. The audit query this app already ships stays; the
request rows join it.

**Whether one query can do it is unmeasured.** The merged form needs two sources, each with its own
`or` group:

```sql
where (source = 'auth_logs' and log_attributes['user_id'] = '…')
   or (source = 'auth_audit_logs' and (log_attributes['auth_audit_event.traits.user_id'] = '…'
        or log_attributes['auth_audit_event.actor_id'] = '…'))
```

`docs/logs.md` lists what that endpoint accepts and what it refuses, and nesting like this is on
neither list. Measure before building: if it is refused, two requests, and the tab says nothing
about it either way.

**Error only** filters on `level`, or on a status of 400 and up — a real error row decides which.
Refresh refetches; nothing polls, because that endpoint throttles.

## Related Code Files

- Modify: `lib/auth-audit.ts` and `lib/auth-audit.test.ts` — the statement and the row shapes
- Modify: `components/auth/user-logs.tsx`
- Modify: `docs/authentication.md` — the `auth_logs` claim is wrong until it is edited

## Implementation Steps

1. Measure the merged query. Record what came back, including a refusal.
2. The statement, built from a checked UUID as the existing one is.
3. Rows: timestamp, status badge, path, message; audit rows keep their action wording.
4. Show all / Error only, and a Refresh button.
5. Correct `docs/authentication.md`.

## Todo List

- [x] Merged query measured
- [x] Statement and parser, tested
- [x] Both row shapes rendered
- [x] Show all / Error only, Refresh
- [x] The docs claim corrected

## Success Criteria

- [x] A user's requests appear with status and path.
- [x] Audit events appear among them.
- [x] Error only narrows to failures.
- [x] Nothing polls the logs endpoint.
- [x] `docs/authentication.md` no longer says `auth_logs` has no user id.

## Risk Assessment

- **One id, two meanings.** In `auth_logs` the `user_id` attribute is the subject of the request,
  while a path may carry someone else's id — `/admin/users/{id}` is a request *about* a user. Filter
  on the attribute, not on the path.

## Built 2026-09-26

**The gate opened.** The merged two-source statement is accepted: 34 rows for the measured user,
request rows and audit events interleaved, in one request rather than two.

```
select timestamp, source, log_attributes['status'], log_attributes['path'], log_attributes['level'],
       event_message
from logs
where (source = 'auth_logs' and log_attributes['user_id'] = '…')
   or (source = 'auth_audit_logs' and (log_attributes['auth_audit_event.traits.user_id'] = '…'
        or log_attributes['auth_audit_event.actor_id'] = '…'))
```

**Error only filters what is already in the browser** rather than asking again. A hundred rows are
in memory and that endpoint is the throttled one; spending a request to hide rows already held would
be the wrong trade.

A failure is a status of 400 and up *or* a level that is not `info`. Measured on this project:
`level` is `info` on 933 rows and `warning` on one, and a 404 exists — neither reading covers the
other.

## The defect the live run found, which the tests did not

The first run put a **19:20 request below a 19:14 event**. An audit event carries its own
`created_at` ending in `Z`; a row's `timestamp` carries no zone, and `Date.parse` reads that as local
time — seven hours out, in Vietnam. Every timestamp is normalised as it is parsed now, and a test
pins the interleaving.

This is the second time in this repository that a zoneless log timestamp has sorted wrongly.
`parseLogTime` in `lib/logs-sql.ts` exists for the same reason, and it did not reach here because
these are two different modules reading the same stream.
