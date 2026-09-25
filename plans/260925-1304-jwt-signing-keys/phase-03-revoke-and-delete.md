---
phase: 3
title: "Revoke and delete"
status: completed
priority: P2
effort: "3h"
dependencies: [2]
---

# Phase 3: Revoke and delete

## Overview

The destructive half. Revoking stops a retired key verifying anything; deleting removes it, but not
for thirty days.

## Requirements

- Revoke a `previously_used` key, behind a confirm that states the real consequence.
- Delete a `revoked` key, and report honestly when the API refuses.
- The revoke warning quotes this project's own `jwt_exp`.

## Architecture

Measured:

```
DELETE previously_used   422  Only keys with revoked status can be fully deleted.
PATCH  -> revoked        200  (not throttled)
DELETE just-revoked      422  Try again after <revoked_at + 30 days>.
DELETE in_use            422  Only keys with revoked status can be fully deleted.
```

**What revocation actually breaks.** A `previously_used` key is still in JWKS and still verifies the
tokens it signed. Revoking removes that. Anyone holding an unexpired token signed by that key stops
being authenticated — immediately, not at their next sign-in. The safe wait is one `jwt_exp` after
the rotation, which is why this page reads that value rather than assuming 3600.

**Delete is attempted, not predicted.** The 422 carries the exact date. Building a countdown would
mean storing a revocation time and computing thirty days in the browser — two things that can be
wrong — to avoid a round trip that answers definitively.

**Delete is offered only on `revoked` rows.** The 422 for `in_use` was measured and the API does
refuse, but a delete button on the key that is currently signing is a UI mistake regardless of what
the server does.

## Related Code Files

- Modify: `lib/mgmt-api.ts` — `deleteSigningKey`, `getAuthConfig`
- Modify: `lib/signing-key-actions.ts` — `revokeKey`, `deleteKey`
- Modify: `lib/project-parts.ts` — `jwt_exp` rides along with the `signing-keys` part
- Modify: `components/project-settings/jwt-keys.tsx`, `jwt-key-dialogs.tsx`

## Implementation Steps

1. `deleteSigningKey` and `getAuthConfig` in `mgmt-api.ts`. `/config/auth` has no `jwt_secret`;
   `jwt_exp` is the one field wanted here.
2. Widen the `signing-keys` reader to `{ keys, jwtExp }` — two upstream calls, one part. This is
   the data-dependent case the CSR plan already allows: the browser never walks a chain.
3. `revokeKey` and `deleteKey` actions, audited on both outcomes like phase 2's.
4. The revoke confirm names the project, states that unexpired tokens signed by this key stop being
   accepted at once, and prints the wait derived from `jwtExp` (e.g. "tokens issued before the
   rotation expire within 1 hour on this project"). Type-the-project-name friction, matching the
   database password reset and the legacy API keys switch.
5. Delete: a plain confirm. On a 422, show the API's sentence with its date verbatim.
6. Surface a revoked key's `updated_at` as "Revoked on …" so the thirty days is at least legible
   after the fact.

## Success Criteria

- [x] Revoke is offered only on `previously_used` rows; delete only on `revoked` rows.
- [x] The revoke confirm prints a wait read from the project, and a project with a non-default
      `jwt_exp` prints that number instead — `tokenLifetime`, with tests.
- [x] Deleting a freshly revoked key shows the API's date, unedited.
- [x] Both writes are audited, on success and on failure.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 450 tests.

## Risk Assessment

- **Someone revokes immediately after rotating.** That is the failure this page exists to prevent,
  and the confirm is the whole mitigation. It must lead with the wait, not bury it.
- **`jwt_exp` unreadable** (permissions, or a 500 on a paused project). Then the confirm says the
  wait is unknown rather than printing a default that might be wrong.

## What was built differently

**The legacy HS256 warning landed here, not in phase 4.** The legacy key sits in `previously_used`,
so the moment this phase put a Revoke button on that group it became reachable — and the API revokes
it with a silent 200, no warning of its own. `RevokeConfirm` adds the `anon`/`service_role` paragraph
when the algorithm is HS256, rather than leaving a gap for one phase. Phase 4 still owns the legacy
tab; it no longer owns the only warning.

**`tokenLifetime` is a tested function, not an inline template.** It is the sentence standing between
someone and the one irreversible action on this page, and its most important case is the one with no
number in it: an unreadable `jwt_exp` reads "an unknown amount of time" rather than quietly assuming
3600.

**One shared `problem` string for revoke and delete**, cleared wherever either dialog opens or
closes. Two separate error slots would have been two chances to repeat the phase-2 defect where a
message outlived the attempt it belonged to — and a delete refusal names a date thirty days out,
which would be an outright lie about a different key.

**`jwt_exp` rides along with the keys in one part.** Two upstream calls, resolved together; the
browser never walks the chain. A second round trip for one integer would have put the sentence on
screen after the dialog that needs it.

## What review caught

Both findings were on `tokenLifetime`, the sentence standing in front of the only irreversible
action on this page.

- **`Math.round` rounded the safe wait down.** A project with `jwt_exp` of 5000 seconds — 1h23m —
  printed "1 hour", so someone who rotated seventy minutes ago would read the confirm as clear and
  revoke on live sessions. It is a wait, so the only safe direction is up: `Math.ceil`, with a test
  that can tell the two apart. The original tests used 3600, 900, 60 and 86400, where round and ceil
  agree, so the direction was never pinned.
- **A non-numeric `jwt_exp` reached the sentence.** `call()` is a cast over `JSON.parse`, and
  `config?.jwt_exp ?? null` passes anything non-nullish through — `"soon"` would have rendered as
  "Tokens on this project last NaN hours". Checked with `Number.isFinite` at the boundary, and
  `tokenLifetime` refuses non-numbers as well, since it is the thing making the promise.

Smaller, same pass: the reader is annotated `Promise<SigningKeysPart>` so the next shape change is a
compile error rather than an `undefined` at runtime; `public_jwk` is dropped from the pick because
nothing renders it and it is the one field that is still an unfiltered upstream object; the rotate
button was still calling `setRotating` directly instead of the helper that clears the error;
`DeleteKeyConfirm` was renamed `DeleteSigningKeyConfirm` since the API keys page exports that name
too with different props.
