---
phase: 2
title: "The read endpoint family"
status: in-progress
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

## What was built, where it differs from the plan

- **The whitelist split in two.** `lib/project-part-names.ts` holds the names and is a pure module
  the test runner can import; `lib/project-parts.ts` holds the readers and is `server-only`. The
  readers are declared `Record<Exclude<Part, "identity">, Reader>`, so a name with no reader fails to
  build and a reader whose name is not on the list fails too — they cannot drift. The first attempt
  put both in one module and the names were then untestable, because `pnpm test` cannot import a
  module that reaches the Management API.
- **`asInterval` moved to `lib/logs-sql.ts`** and both the page and the `logs` part use it. The page
  had its own copy of the same validation.
- **`identity` needs no upstream call.** `resolveProject` already carries the project and the
  connection, so that part is answered from what the gate returned.
- **`metrics` returns one number, not the Prometheus dump.** Several hundred lines of exposition
  format is not something to hand a browser so it can read `memoryPercent` out of it.
- **`api-keys` cannot be made to reveal.** The reader calls `listApiKeys(t, ref)` with the default,
  and the flag is not reachable from the query string — a test pins that no part name carries it.

## The proxy had to change, and that was a finding

Probed against a running build with no session: **every `/api/projects/…` request was answered with a
307 to `/login`**. The proxy gates the whole app, and a redirect is right for a page — but a `fetch`
follows it, receives HTML, and the client reports an expired session as a JSON parse error.

The proxy now answers `/api/projects` with `401 {"ok":false,"reason":"Not authenticated"}` and
`no-store`. The handlers keep their own `requireUser`; the proxy only decides what shape a refusal
takes. Verified:

```
ddfvxjfbazumqvoweehn/disk   401  cache-control: no-store  {"ok":false,"reason":"Not authenticated"}
ddfvxjfbazumqvoweehn/nope   401  cache-control: no-store  {"ok":false,"reason":"Not authenticated"}
not-a-ref/disk              401  cache-control: no-store  {"ok":false,"reason":"Not authenticated"}
```

## Review findings, and what came of them

Reviewed 2026-09-15, against Supabase's own OpenAPI for the endpoints in question. One Critical, and
it was the assumption this whole design rests on.

- **Critical: `api-keys` returned the real keys.** `reveal=false` does not hide the value — this repo
  measured that itself and wrote it on the `ApiKey` type in `mgmt-api.ts`, and
  `framework-actions.ts` depends on it. Passing the response through put the service-role secret, the
  one that bypasses RLS, in a plain GET any signed-in browser could issue, and phase 5 would have
  called it on every load of the Database page. The reader now picks `{ id, name, type, prefix }`,
  which is all the page renders. **The flag was never the boundary; the field list is.**
  The test that claimed to cover this asserted that no *part name* contains `reveal` — true, green,
  and irrelevant to what the reader returns. It now says what it actually proves.
- **High: "shaped data" was only true of three readers.** `call()` parses and casts; TypeScript does
  not strip fields at runtime. `addons` was returning the entire purchasable catalogue with prices.
  It now returns `selected_addons` alone, and the module comment states plainly which readers pick
  fields and which pass through a modelled response — the second group's extras were checked and
  none are credentials.
- **High: the fan-out would have raced the token refresh.** A refresh token is single-use and
  Supabase rotates it. `cache()` deduplicates within one request, but ten parts are ten requests, so
  ten refreshes of the same connection would fire at once, one would win, and nine would record
  `last_error` and return no token — which `resolveProject` turns into a 404. Every hour, a healthy
  connection would flip to "Reconnect required" and most of the dashboard would 404. A failed
  refresh now re-reads the row first: if someone else rotated the token in the meantime, it uses
  what they stored.
- **High: authorisation cost multiplied by the number of parts.** Each request re-ran the whole gate:
  one `getProject` per connection, ten times over. `lib/logs-sql.ts` already records that this API
  throttles at about a minute's worth of calls. `resolveProject` now remembers, per user and for a
  minute, which connection answered for a ref, and tries that one first. Only a connection id is
  kept, never a token, and it only ever selects from rows the caller's own RLS-scoped query
  returned — a stale entry costs one wasted call and falls back to the fan-out.
- **Medium: an MFA-gated user got HTML with a 200 on it.** The 401 branch fixed the signed-out case;
  the MFA gate one branch later still redirected, and `fetch` follows redirects. The read API now
  answers `403 { ok: false, reason }` there too. Verified there is no bypass: the gate still runs for
  these paths, only the refusal's shape changed.
- **Medium: a throw escaped the JSON contract.** `resolveProject` sits outside `attempt`, so a failed
  connections query or a session expiring mid-request produced a non-JSON 500 — the same parse error
  the proxy change was made to prevent. The handler body is wrapped now.
- Also: `/api/projects` is matched exactly rather than by prefix, so a future `/api/projectsfoo` does
  not inherit this refusal shape (verified: it still redirects); `HEAD` answers 405, because Next
  derives it from `GET` and a `HEAD` of `logs` would run the whole Logflare query and discard it; and
  a dead `INTERVALS` constant the extraction left behind is gone.

Accepted, not fixed:

- **A 404 still means either "not your project" or "this connection could not refresh".** The race
  fix removes the common cause; telling the two apart properly means changing what `resolveProject`
  returns, which every caller in the app reads.
- **A non-`MgmtError` failure reaches the browser as its own message.** `safe.ts` only dresses up
  Management API errors; a runtime fault arrives raw. Not a secret, but not a sentence anyone wants
  to read either.
- **`tables` and `api-keys` are parts the plan's list did not name.** Deliberate: the Database page
  reads both. With the key fields picked, the second one is a list of names and prefixes.

## Success Criteria

- [x] No session → 401 JSON, not a redirect to HTML — probed against a running build.
- [x] `Cache-Control: no-store` on every response — probed.
- [x] The part list is a closed set, tested: every listed name resolves, and nothing else does,
      including `restore`, `query` and anything carrying `reveal`.
- [x] `api-keys` returns names and prefixes, never a key value — the field list, not the flag.
- [x] A concurrent refresh of the same connection no longer marks it as needing reconnection.
- [x] Authorisation costs one fan-out per user per ref per minute, not one per part.
- [x] Every refusal is JSON: signed out (401), MFA not verified (403), unknown part or project (404),
      unexpected throw (500). Probed for the first; `/api/projectsfoo` still redirects, as it should.
- [x] The interval a part accepts is validated by the same function the page uses, tested.
- [x] `metrics` returns a number rather than the upstream dump; `api-keys` cannot reveal.
- [ ] **Needs a signed-in session.** Every part returns what the corresponding server call returns
      today; unknown part → 404; unowned ref → 404; a refused read carries its reason.
- [ ] **Needs a signed-in session.** No token and no raw envelope in any body, checked by reading
      the responses.

## Risk Assessment

**This is the new attack surface.** Every part is a read a browser can now ask for directly. The map
keeps that set closed; a dynamic dispatch would not.

**A reason that leaks too much.** `safe()`'s reasons are written for the owner of the project. They
are fine to return to that owner and must not grow into raw upstream bodies.
