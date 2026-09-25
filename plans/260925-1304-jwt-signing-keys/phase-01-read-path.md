---
phase: 1
title: "The read path"
status: completed
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: The read path

## Overview

The route, the nav row, and the page showing this project's signing keys. No writes.

## Requirements

- A new settings page at `/p/{ref}/settings/jwt-keys`, reachable from the settings nav.
- The current signing key, the keys that came before it, and any standby, each with algorithm,
  status and dates.
- Shape errors the way every other part does: `lib/safe.ts`'s taxonomy, not an HTTP status.

## Architecture

`GET /v1/projects/{ref}/config/auth/signing-keys` returns **`{keys: [...]}`**, an object — unlike
`/api-keys`, which returns a bare array. A reader written from the neighbouring page's habit reads
`undefined`. The helper unwraps it so nothing downstream has to remember.

Key fields: `id`, `algorithm`, `status`, `public_jwk`, `created_at`, `updated_at`.

Statuses seen in practice: `in_use`, `previously_used`, `standby`, `revoked`.

The page groups by status rather than listing flat, because the four groups mean different things
and carry different actions in later phases.

## Related Code Files

- Create: `lib/signing-keys.ts` — types, status ordering, grouping. Pure, so it is testable.
- Create: `lib/signing-keys.test.ts`
- Create: `components/project-settings/jwt-keys.tsx`
- Create: `app/(app)/p/[ref]/settings/jwt-keys/page.tsx`
- Modify: `lib/mgmt-api.ts` — `listSigningKeys`
- Modify: `lib/project-part-names.ts` — add `"signing-keys"`
- Modify: `lib/project-parts.ts` — the reader
- Modify: `lib/part-cache.ts` — `"signing-keys": 0`
- Modify: `components/project-settings/settings-nav.tsx` — a row after API Keys

## Implementation Steps

1. `listSigningKeys(t, ref)` in `mgmt-api.ts`, unwrapping `{keys}` to `SigningKey[]`.
2. `lib/signing-keys.ts`: the `SigningKey` type, and `groupKeys()` returning
   `{ current, standby, previous, revoked }`. Pure.
3. Tests for `groupKeys`, including the object-not-array trap (a reader handed `[]` vs `{keys: []}`)
   and a list with two `previously_used` keys of different algorithms.
4. Register the part name, the reader, and TTL 0. The compiler enforces all three — a name with no
   reader fails to build.
5. The page shell: `resolveProject` then `notFound()`, exactly as the API keys page does, passing
   `projectRef` and `projectName`.
6. `jwt-keys.tsx`: the two tabs' chrome (tab 2 lands in phase 4), and tab 1's read-only tables.
   Skeletons while waiting; `Empty` with `reasonOf(state)` on failure.
7. Add the nav row with its endpoint in `title`, `ready: true`.
8. Run `pnpm typecheck && pnpm test && pnpm lint`. A brand-new route needs `next typegen` (or one
   `next dev`/`next build`) before `PageProps<'/p/[ref]/settings/jwt-keys'>` exists — without it the
   typecheck fails with `params: Promise<unknown>` and the failure looks like a code error.

## Success Criteria

- [x] `/p/{ref}/settings/jwt-keys` lists this project's keys grouped by status.
- [x] The nav row appears after API Keys and is not greyed.
- [x] A project whose token lacks `auth_signing_keys_read` shows the permission reason, not a crash.
      Handled by the existing `attempt`/`describe` path; no new code was needed.
- [x] `pnpm typecheck && pnpm test && pnpm lint` green — 443 tests.

## Risk Assessment

- **The `{keys}` envelope.** Mitigated by unwrapping once in `mgmt-api.ts` and pinning it in a test.
- **A paused project returns 500** `Unable to list all signing keys` — measured. It is not a bug in
  this app and should read as "this project is not running", not as a failure.

## What was built differently

Three departures, all found while building or in review.

- **No tab chrome.** Step 6 called for both tabs' frame with the second empty until phase 4. A tab
  that leads nowhere is a promise the page cannot keep; phase 4 adds the bar together with what goes
  in it.
- **`projectName` is not passed to the component.** Nothing in this phase uses it. Phase 3's confirm
  dialogs will need it.
- **`standby` is a list, not one key.** Nothing measured says a project may hold only one, and a
  standby *is* published in JWKS — so an undrawn second one would be a key verifying tokens while
  the page denies it exists.

Two defects the review caught, both now fixed and covered:

- `listSigningKeys` returned `body?.keys ?? []`, and on a bare array `[].keys` is
  `Array.prototype.keys` — a function, truthy, which would have travelled on as if it were the list.
  The endpoint is normalised with `Array.isArray` instead, and `lib/mgmt-api.test.ts` pins both the
  `{keys}` envelope and the bare-array shape of the mistake.
- The `Tab` extraction orphaned `cn` in `api-keys.tsx`. Neither `tsc` nor eslint is configured to
  see an unused import in this repo, so it was invisible to the toolchain.
