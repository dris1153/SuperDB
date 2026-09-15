---
phase: 2
title: "The read endpoint family"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 2: The read endpoint family

## Overview

One route handler serving every read the project dashboards need, behind a whitelist.

## Requirements

**Functional**
- `GET /api/projects/[ref]/[part]` returns the shaped data for that part.
- Unknown part → 404. Unowned or malformed ref → 404.
- The `safe()` / `attempt()` taxonomy survives as JSON: a refusal carries its reason.

**Non-functional**
- No access token, and no raw Management API envelope, in any response body.
- `Cache-Control: no-store`. These are per-user and derived from a decrypted token.

## Architecture

```
app/api/projects/[ref]/[part]/route.ts
  requireUser()            → 401 if there is no session
  resolveProject(ref)      → 404 if this user owns no connection that can see it
  READERS[part]            → 404 if the part is not in the map
  reader(token, ref)       → JSON
```

**The map is the security boundary.** It is a literal object from part name to reader function; there
is no dynamic lookup into `lib/mgmt-api.ts`, so a request cannot name a function that was never meant
to be reachable. Its keys are also the client's part type, so a typo is a type error rather than a
404 at runtime.

`resolveProject` is already the authorisation gate for every project-scoped action in the app
(`lib/sql-editor-actions.ts`, `lib/write-actions.ts`, `lib/ddl-actions.ts`). Nothing new is invented
here; the same gate now also fronts reads.

**Parts**: `identity`, `addons`, `branches`, `migrations`, `backups`, `disk`, `overview`, `metrics`,
`pooler`, `health`, `logs`. `identity` returns what `resolveProject` already has — project name,
status, region, the connection's label — so the shell can render a title and a 404 without a second
fan-out. `logs` takes the interval as a query parameter, validated against the existing `INTERVALS`.

**Response shape** mirrors `lib/safe.ts` rather than flattening it:

```ts
{ ok: true, data: T } | { ok: false, reason: string }
```

A 200 with `ok: false` is deliberate for a *refused* read — the project page prints
"Disk: …" and "Memory: …" today, and a bare 403 would throw that reason away. Transport and
authorisation failures stay real HTTP statuses.

## Related Code Files

- Create: `app/api/projects/[ref]/[part]/route.ts`, `lib/project-parts.ts` (the map and its types)
- Read for context: `lib/inventory.ts`, `lib/mgmt-api.ts`, `lib/safe.ts`, `lib/logs-sql.ts`,
  `app/api/connect/callback/route.ts` for how this repo writes a route handler

## Implementation Steps

1. `lib/project-parts.ts`: the map, its key type, and the response type.
2. The handler: auth, gate, lookup, shape, `no-store`.
3. Tests for anything pure — the part-name validation and the interval validation belong in `lib/`.
4. Verify by hand with a signed-in session: a good part, an unknown part, an unowned ref.

## Success Criteria

- [ ] Every part returns what the corresponding server call returns today.
- [ ] Unknown part → 404. Unowned ref → 404. No session → 401.
- [ ] No token and no raw envelope in any body — checked by reading the responses, not by assuming.
- [ ] A refused read carries its reason rather than a bare status.
- [ ] `Cache-Control: no-store` on every response.

## Risk Assessment

**This is the new attack surface.** Every part is a read a browser can now ask for directly. The map
keeps that set closed; a dynamic dispatch would not.

**A reason that leaks too much.** `safe()`'s reasons are written for the owner of the project. They
are fine to return to that owner and must not grow into raw upstream bodies.
