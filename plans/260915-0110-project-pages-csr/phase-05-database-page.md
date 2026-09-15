---
phase: 5
title: "Database page"
status: in-progress
priority: P2
effort: "4h"
dependencies: [3]
---

# Phase 5: Database page

## Overview

`/p/[ref]/database` gets the same treatment: five awaited calls become five cards.

## Requirements

- Health, disk, API keys, database overview and the table list each land on their own.
- API keys stay hidden until asked for, exactly as now.

## Architecture

Same shape as phase 4 and no new mechanism. The one thing to keep deliberate is **API keys**:
`listApiKeys(token, ref, reveal)` defaults to not revealing, and the page must not start revealing
them merely because the request moved to the client. The part exposes the unrevealed form only;
revealing stays whatever it is today.

## Related Code Files

- Modify: `app/(app)/p/[ref]/database/page.tsx` and its cards
- Read for context: `lib/mgmt-api.ts` (`listApiKeys`, `getHealth`), phase 4's cards

## Implementation Steps

1. Split into cards.
2. Wire each to its part.
3. Check the API keys path specifically.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## What was built

208 lines awaiting five calls became a 44-line shell and four sections. `tables` is asked for by the
stats row and the list under the same key, so it is one request and the count cannot disagree with
the list it counts.

`/p/[ref]/database` first load: 630,122 → 655,357 bytes.

**Where the old page's `safe()` was deliberately dropped.** Health, overview and tables used it, so a
failed call and an empty result printed the same sentence. Now a refusal carries the API's reason and
"nothing came back" stays its own answer. The one place that keeps the old wording is the health
fallback, which still suggests the project may be paused — that is the usual cause and the API's own
sentence rarely says it.

## Review findings, and what came of them

Reviewed 2026-09-15, following the API key path end to end: reader, wire, component, cache.

- **The key path is clean** — the reader picks its fields, `?reveal=true` in the URL is inert because
  only `logs` reads the query string, and nothing in the cache or the bundle carries a value. But the
  pick was held up by **nothing except that line of code**: `ApiKey[]` is structurally assignable to
  `Pick<ApiKey, …>[]`, so even annotating the reader would not have stopped a pass-through, and no
  test can import a `server-only` module to check. `KeySummary` is now branded `api_key?: never`, and
  the reader is annotated with it. Verified by trying it: returning `listApiKeys(t, ref)` directly
  gives `error TS2322: Type 'ApiKey[]' is not assignable to type 'KeySummary[]'`. The component
  imports that same type rather than redeclaring it.
- **A 200 with an empty body would have taken the route down.** `call()` returns `undefined` for a
  bodiless success, `JSON.stringify` drops the key entirely, and `{ ok: true }` with no `data` passed
  the hook's shape check — then three components dereferenced `.length` on it, inside a route whose
  error boundary would have swallowed all four sections. The old page was null-safe at exactly those
  three points. The route sends `data ?? null` and the components check the array.
- **Two cards in one row answered the same question differently.** Disk printed its refusal reason;
  database size and connections, which come from a part that has one, stayed silent because the old
  page's `safe()` had thrown it away. They print it now.
- The table skeleton was 160px against a real table of ~440px; it is table-sized now. `type` was
  picked from the key shape and rendered nowhere, so it is not picked any more.

The reviewer also noted that the module comment claimed more than had been checked about the
pass-through readers — it now says what was actually verified, and names the pooler's connection
string as the closest call, which is on the Get connected panel by design.

## Success Criteria

- [x] Each section lands independently, with a placeholder sized like what replaces it.
- [x] API keys are no more revealed than they were — and a future pass-through is now a compile
      error rather than a code review.
- [x] The table list's empty and unreadable states still read correctly, and the unreadable one now
      says why.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` (377), `pnpm build` green.
- [ ] **Needs the app.** All four sections seen in each state, with the network throttled.

## Risk Assessment

**Reveal by accident.** The keys endpoint takes a `reveal` flag. It must not become reachable from
the browser by adding a query parameter.
