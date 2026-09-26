---
phase: 2
title: "Create a standby key, and rotate"
status: completed
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 2: Create a standby key, and rotate

## Overview

The two safe writes: minting a standby key, and switching signing over to it.

## Requirements

- Create a standby key, choosing ES256 or RS256.
- Promote a standby to `in_use` in **one** request.
- Both audited through `recordWrite`, on every outcome.

## Architecture

Measured, and the reason this phase is short:

```
POST  /signing-keys {algorithm, status:"standby"}   201
PATCH /signing-keys/{id} {status:"in_use"}          200 — the old key demotes itself
```

The demotion needs no second call, so there is no failure mode where the project ends up with two
keys `in_use`. That removes the compensating-write logic this phase would otherwise need.

**Algorithms.** The enum in the spec is `EdDSA|ES256|RS256|HS256`. `EdDSA` returns 422 "currently
not supported"; `HS256` is symmetric and is what this project is migrating away from. Offer ES256
(default) and RS256.

**Throttle.** A 429 after a recent promotion carries the moment it lifts. Show that sentence.

## Related Code Files

- Create: `lib/signing-key-actions.ts` — `createStandbyKey`, `rotateToStandby`
- Create: `components/project-settings/jwt-key-dialogs.tsx`
- Modify: `lib/mgmt-api.ts` — `createSigningKey`, `updateSigningKeyStatus`
- Modify: `components/project-settings/jwt-keys.tsx`

## Implementation Steps

1. `createSigningKey(t, ref, body)` and `updateSigningKeyStatus(t, ref, id, status)` in `mgmt-api.ts`.
2. `lib/signing-key-actions.ts`, `"use server"`, each action: `resolveProject` to prove ownership,
   the call, `recordWrite` on **both** outcomes, `revalidatePath` not needed (the part is TTL 0 and
   the browser refetches), returning `{ok: true} | {ok: false, reason}` where `reason` is the API's
   own message.
3. The create dialog: an algorithm picker of exactly two options, ES256 preselected. Each option
   carries a sentence rather than a "recommended" badge — which of the two fits depends on what is
   verifying the tokens. No name field; the API assigns none.
4. The rotate confirm. It states what was measured, not what is feared: the standby's public key is
   already in JWKS so clients can verify the new signature immediately, the current key becomes
   `previously_used` and stays in JWKS, and tokens it signed keep working until they expire.
   **Nobody is logged out.** This is the one confirm in this app that exists to reassure rather than
   to warn, and writing it as a scare would train people to avoid the safe half of the lifecycle.
5. Wire both into tab 1. Create is offered only when no standby exists; rotate only when one does.

## Success Criteria

- [x] Creating a standby adds a `standby` row and changes nothing else.
- [x] Rotating promotes it and moves the old key to `previously_used` — after one request.
- [x] A 429 shows the API's sentence including the timestamp — see below, this needed a change in
      `lib/safe.ts`.
- [x] Both writes appear in the connection event log, on success and on failure.
- [x] The picker does not offer EdDSA.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 443 tests.

## Risk Assessment

- **Rotating is offered too casually.** It is genuinely safe, but it starts a clock: the old key
  should eventually be revoked, and that is phase 3's job to make visible.
- **A standby left lying around.** Harmless — it signs nothing — but it *is* published in JWKS,
  so the page should describe it as prepared rather than as idle.

## One change outside this phase

`describe()` in `lib/safe.ts` returned a fixed sentence for **every** 429 before it looked at the
response body:

> Supabase is rate limiting this token — the figures return once the minute rolls over.

That sentence was written for the metrics endpoint, and for the signing keys it throws away the only
part worth reading: the throttled response names the exact moment it lifts. The body-parsing block
that was already there now runs **first**, and the generic sentence is the fallback when there is no
JSON message to show.

It is a repo-wide behaviour change, deliberately made rather than worked around locally, because the
comment on that block already stated the principle — *"A generic status line would throw away the
only part the user can act on"* — and the 429 branch was the one place contradicting it.

Three things about its blast radius, corrected after review said the first version of this paragraph
was wrong:

- **`lib/safe.test.ts` did pin the old sentence**, and still passes, because `"Too Many Requests"`
  contains no `{` and so takes the fallback. The new behaviour now has its own test alongside it.
- **The metrics card is unaffected, and not by luck of the reorder.** `getMetricsText` does not go
  through `call()` and throws `metrics → 429` with no body, so there is nothing for the brace scan
  to find. That is load-bearing and is now said in `getMetricsText` itself, where someone would
  otherwise "improve" the message by adding the body.
- **Every other 429 does change**, since they all go through `call()`. The signing-key throttle body
  was measured and is `{"message": "Please wait until …"}`, so the reorder does what it is for.

## What was built differently

- **Two option buttons, not a `Select`.** There are exactly two algorithms and each needs a sentence
  of explanation. A dropdown would hide the only thing worth reading.
- **`Group` takes an `action` render prop.** Rotation belongs on the standby row itself, not in a
  separate card, since a project may hold more than one standby and the button has to say which key
  it means.

## Two defects review caught after this phase was marked done

- **`rotateToStandby` put an unvalidated `id` into a URL path.** `call()` interpolates without
  escaping, and the WHATWG URL parser resolves `../` at parse time — verified by running it — so a
  crafted id did not merely name the wrong key, it chose the endpoint. Any signed-in browser could
  have driven `PATCH {"status":"in_use"}` against a project that never passed `resolveProject`,
  using a connection token it can never read itself, and the audit line would have named the project
  that *was* checked. `isKeyId` now gates it, ahead of both the call and the audit write, with the
  traversal and query-injection shapes in `lib/signing-keys.test.ts`.
- **`rotateError` outlived the dialog.** Cancelling left the message in state, so the next key's
  confirm opened already showing the previous key's failure — worst with the 429 this phase exists
  to surface, whose deadline would already have passed. Cleared wherever the dialog opens or closes.

Also from review, smaller: the type import from `signing-keys.ts` into `mgmt-api.ts` was deleted in
favour of the literal union, because the two modules import types from each other and a value import
in the server-only direction would have been a real ESM cycle.
