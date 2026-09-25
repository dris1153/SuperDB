---
phase: 3
title: "The Logs tab"
status: pending
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

- [ ] Merged query measured
- [ ] Statement and parser, tested
- [ ] Both row shapes rendered
- [ ] Show all / Error only, Refresh
- [ ] The docs claim corrected

## Success Criteria

- [ ] A user's requests appear with status and path.
- [ ] Audit events appear among them.
- [ ] Error only narrows to failures.
- [ ] Nothing polls the logs endpoint.
- [ ] `docs/authentication.md` no longer says `auth_logs` has no user id.

## Risk Assessment

- **One id, two meanings.** In `auth_logs` the `user_id` attribute is the subject of the request,
  while a path may carry someone else's id — `/admin/users/{id}` is a request *about* a user. Filter
  on the attribute, not on the path.
