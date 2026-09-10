---
phase: 6
title: "Management API cache"
status: pending
priority: P3
effort: "2h"
dependencies: [4]
---

# Phase 6: Management API cache

## Overview

Every Management API call uses `cache: "no-store"` and every page is `force-dynamic`, so nothing is
cached anywhere. A 15–30 s cache on the three slowest-changing reads — `listProjects`, `listOrgs`,
`getProject` — would make project-to-project navigation near-instant.

**Lowest priority and highest risk in this plan.** The failure mode is a cross-tenant data leak, not
a slow page. Do not start it until Phases 2–4 are measured and shown insufficient.

## The risk that sets this phase apart

This is multi-tenant data. `listProjects(token)` returns *one Supabase account's* projects. A cache
key that does not fully distinguish the caller serves one user's project list to another.

Two specific traps:

1. **Key completeness.** The cache key must include the connection identity. Key on
   `connection.id` — **never on the token itself**, which rotates on OAuth refresh and must not land
   in a cache key or a log line.
2. **`cookies()` inside a cache scope is unsupported** (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md`).
   `connectionsWithTokens()` reaches `cookies()` through `requireUser()`, so it can never run inside
   the cached function. The token and connection id must be resolved *outside* and passed in as
   arguments.

Both are satisfiable, but they are the whole job. Treat the caching as the easy part.

## API choice — verify before writing code

Per `AGENTS.md`, read the docs in `node_modules/next/dist/docs/` rather than relying on training
data. Already established for this version:

- `unstable_cache` **has been replaced by `use cache` in Next 16**
  (`.../04-functions/unstable_cache.md`) but still functions.
- `use cache` requires the `cacheComponents` flag, which this project does **not** enable
  (`next.config.ts` carries only security headers).
- The applicable guide for this project's configuration is
  `.../02-guides/caching-without-cache-components.md`.

So the choice is:

| Option | Cost |
|---|---|
| `unstable_cache` today | Works now, no config change, but adopts an API Next has already superseded |
| Enable `cacheComponents` + `use cache` | Next 16's direction, but a project-wide rendering change well beyond this plan's scope |

**Recommendation: `unstable_cache`.** Enabling `cacheComponents` to speed up three calls is a
disproportionate change, and this plan's own premise is the cheapest effective fix. Record the
decision so a future migration knows where to look.

## Requirements

**Functional**
- `listProjects`, `listOrgs`, `getProject` served from cache within a 15–30 s TTL.
- Cache entries are strictly per-connection. No response is ever served across connections or users.
- Manual refresh paths and any post-mutation view still show current data.

**Non-functional**
- **Never cached:** health, metrics, logs, disk util, and every table-editor read. Those are either
  live status or user data mid-edit.
- Access tokens never appear in a cache key.

## Architecture

Cached wrappers live next to their callers in `lib/inventory.ts`, not inside `lib/mgmt-api.ts`.
`mgmt-api.ts` stays a thin, uncached transport — that is what makes it easy to reason about, and
`lib/mgmt-api.test.ts` depends on it staying that way.

```
loadInventory()                       // resolves user + tokens (touches cookies) — never cached
  └─ cachedProjectsFor(connectionId, token)   // unstable_cache, key: ["projects", connectionId]
       └─ listProjects(token)                 // untouched transport
```

The token is an argument, not part of the key. The connection id is the key. A token refresh
therefore does not invalidate a still-valid cached list, which is correct — the same account's
projects are the same projects.

## Related Code Files

- Modify: `lib/inventory.ts` — add cached wrappers around the three calls
- Read for context: `lib/mgmt-api.ts` (leave uncached), `lib/connections.ts`,
  `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
- Do not touch: `lib/table-rows.ts`, `lib/table-editor.ts`, `lib/prometheus.ts`, `lib/logs-sql.ts`

> **Overlaps [260910-0934-connection-ordering](../260910-0934-connection-ordering/plan.md) phase 2**,
> which rewrites `loadInventory`'s sort in this same file. Neither blocks the other, but whichever
> lands second resolves a conflict there. That plan is not deferred and this phase is P3, so expect
> it to land first.

## Implementation Steps

1. Read `caching-without-cache-components.md` and `unstable_cache.md` in full. Confirm the
   `cookies()` restriction and the key semantics against the docs, not against this plan.
2. Add cached wrappers in `lib/inventory.ts`, keyed on `connection.id`, TTL 15–30 s, token passed as
   an argument.
3. Add a header comment stating what is cached, what is deliberately not, and why the key is the
   connection id rather than the token.
4. **Write the isolation test first if it can be made to run without network** — two connection ids
   must never share an entry. If it cannot be unit-tested, the manual check in step 5 becomes a
   release gate, not an optional pass.
5. Manual multi-tenant verification: with **two different connections** on one account, load the
   board, switch, reload. Confirm each shows only its own projects. Then repeat with **two different
   signed-in users** if a second test account exists.
6. Verify staleness is acceptable: pause or rename a project upstream and confirm it corrects within
   the TTL.
7. Measure navigation between two projects against `baseline.md`.

## Success Criteria

- [ ] Only `listProjects`, `listOrgs`, `getProject` are cached; nothing else.
- [ ] Cache key includes the connection id; no token appears in any key.
- [ ] Two connections on one account never see each other's projects — verified manually.
- [ ] Two users never see each other's data — verified manually if a second account exists.
- [ ] Upstream changes appear within the TTL.
- [ ] `pnpm test` and `pnpm typecheck` green.
- [ ] Measured improvement on project-to-project navigation, recorded in `baseline.md`.
- [ ] API choice and its reasoning recorded in the file's header comment.

## Risk Assessment

**Cross-tenant leak. Severity: critical.** An incomplete cache key serves one account's project list
to another. This is the reason the phase is P3 and last. Mitigation: key on connection id, explicit
two-connection and two-user manual verification as release gates. If the isolation check cannot be
performed, **do not ship this phase** — the latency win does not justify an unverified multi-tenant
cache.

**`cookies()` inside the cache scope.** Would throw at runtime, or worse, silently capture one
request's identity into a shared entry. Mitigation: tokens and ids resolved outside and passed in;
`connectionsWithTokens()` never called inside a cached function.

**Stale status misleading the user.** A project shown as healthy for up to 30 s after pausing.
Accepted: status tiles and health are explicitly excluded from caching, so only the project *list*
goes stale, and by name and ref, which rarely change.

**Adopting a superseded API.** `unstable_cache` is replaced by `use cache` in Next 16. Accepted
deliberately; recorded in the header comment so a future `cacheComponents` migration finds it.

**Scope creep into a caching layer.** Three functions, one file. If this phase starts touching
`mgmt-api.ts` or the table editor, stop — that is a different project.
