---
phase: 3
title: "MFA gate: authoritative factors"
status: in-progress
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: MFA gate — authoritative factors

> **Corrected 2026-09-10, during implementation.** This phase was written as a latency fix on a false
> premise: that `getAuthenticatorAssuranceLevel()` made a second `getUser()` network call. It does
> not, on the path this app took. The phase was kept because the rewrite turned out to close a real
> security gap instead. The original claim and its correction are preserved below rather than quietly
> edited away — the plan's own rule is that an unchecked claim is worse than no claim.

## What the original premise got wrong

`GoTrueClient._getAuthenticatorAssuranceLevel(jwt)` has two branches:

```js
async _getAuthenticatorAssuranceLevel(jwt) {
  if (jwt) {                                        // ← line 5013
    …
    const { data: { user } } = await this.getUser(jwt);   // ← line 5021, a real network call
    …
  }
  const { data: { session } } = await this.getSession();  // ← line 5039, reads the cookie
  …
  const verifiedFactors = session.user.factors?.filter(f => f.status === 'verified') ?? [];
}
```

`proxy.ts` called it **with no argument**, so `jwt` was undefined and line 5021 never ran. Upstream's
own docstring says so (`types.d.ts:1404-1408`): *"When called without a JWT parameter, this method is
fairly quick (microseconds) and rarely uses the network."*

**Old cost: 1 `getUser` + 1 `getSession`. New cost: 1 `getUser` + 1 `getSession`. Net latency
change: zero.** The latency win in this plan belongs entirely to Phase 2's `cache()`.

## Why the phase still shipped

The two branches read factors from **different sources**, and that difference is a real gap:

| | Factor source | Freshness |
|---|---|---|
| Old (`session.user.factors`) | the session cookie | only updates when the token refreshes — up to an hour stale |
| New (`data.user.factors`) | the `getUser()` response | authoritative, immediate |

So under the old code, **a user who enrolled MFA in one browser was not challenged in another browser
holding an older cookie** until that token refreshed. The new gate reads the response the proxy
already fetches, and enrollment takes effect at once.

That is the phase's actual deliverable. It is a security improvement, not a performance one.

## Requirements

**Functional**
- A user with any factor at `status === "verified"` whose current level is not `aal2` is redirected
  to `/mfa`.
- A user with no verified factor is never redirected to `/mfa`.
- `/mfa` and every public path stay reachable, so a user mid-challenge can verify or sign out.
- Factors are read from the `getUser()` response, never from the session cookie.

**Non-functional**
- Decision logic is unit-testable.
- No new network calls (achieved: the call count is unchanged).

## Architecture

`pnpm test` globs `lib/**/*.test.ts`, so a root-level `proxy.test.ts` would never run. The decision
lives in `lib/mfa-gate.ts` as pure functions; `proxy.ts` does only I/O and redirects.

- `aalClaim(accessToken)` — base64url-decodes the payload segment and returns the `aal` claim, or
  `null` on any malformed input. Never throws; `proxy.ts` must not 500 on a mangled cookie.
- `needsMfaChallenge(factors, currentLevel)` — `factors.some(f => f.status === "verified") &&
  currentLevel !== "aal2"`.

**Fail-closed:** an unreadable claim alongside a verified factor challenges rather than passes.

**Reading the claim unverified is sound here** because `getUser()` on the line above already
validated the session against Supabase. Documented in the module header.

**Ordering:** `getSession()` runs after `getUser()` so any token refresh has already landed.

## Related Code Files

- Create: `lib/mfa-gate.ts`, `lib/mfa-gate.test.ts`
- Modify: `proxy.ts`

## Implementation Steps

1. ✅ Write `lib/mfa-gate.ts` with both helpers and a header comment covering the signature question,
   the fail-closed choice, and why factors must come from `getUser()`.
2. ✅ Write `lib/mfa-gate.test.ts` covering the matrix below.
3. ✅ Tests green before `proxy.ts` was touched.
4. ✅ Rewire the gate block in `proxy.ts`.
5. ✅ `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
6. ⬜ **Manual end-to-end against a real enrolled account** — see Success Criteria.

## Test matrix

| Factors | `aal` claim | Expected |
|---|---|---|
| one `verified` | `aal1` | redirect `/mfa` |
| one `verified` | `aal2` | pass through |
| one `verified` | claim unreadable / token missing | redirect `/mfa` (fail closed) |
| one `unverified` only | `aal1` | pass through |
| none / `undefined` / `null` | anything | pass through |
| mixed, one `verified` | `aal1` | redirect `/mfa` |
| factor object with no `status` | `aal1` | pass through |

`aalClaim` cases: valid token; padding for every base64 remainder; non-ASCII in other claims;
malformed segment count; empty payload; non-base64 payload; valid base64 that is not JSON; payload
without `aal`; non-string `aal`; `null`/`undefined`/empty input. None may throw.

Path conditions (`/mfa`, public paths) are proxy-level, not gate-level — covered by the manual run.

## Success Criteria

- [x] `lib/mfa-gate.ts` under 60 lines, header comment explains the security reasoning.
- [x] `lib/mfa-gate.test.ts` covers the matrix; `aalClaim` never throws.
- [x] `pnpm test` green — 262 (253 prior + 9 new).
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.
- [x] `Factor.status` is required, so upstream drift breaks the build rather than the gate.
- [x] Factors read from `data.user.factors`, not `session.user.factors`.
- [x] Cross-reference added to `260824-1218-.../phase-03-hardening.md`.
- [ ] **Manual end-to-end, blocking:** an account with TOTP enrolled is still challenged at `aal1`;
      after verifying, `/` is reachable; an account without a factor is never sent to `/mfa`; `/mfa`
      itself does not redirect-loop. **Typecheck and unit tests do not exercise the gate. Do not mark
      this phase complete on green CI alone.**

## Known gaps

- **The wiring seam is untested.** All 9 tests target the pure functions. Miswiring `proxy.ts` to
  `session?.user?.factors`, or passing `undefined`, would typecheck and pass every test while
  silently restoring the stale-cookie gap. A comment in `proxy.ts` pins the intent; the manual run is
  the real check. Testing middleware would need `NextRequest` and Supabase client mocks — deferred as
  disproportionate, but this is the reason the manual criterion is blocking.
- **Non-TOTP verified factors loop (pre-existing).** `needsMfaChallenge` counts any verified factor,
  but `lib/mfa-actions.ts::verifyChallenge` looks up `factors?.totp?.[0]` and redirects to `/` when
  absent. A user with only a verified phone or WebAuthn factor would bounce `/` → `/mfa` → `/`
  forever, and `/settings` lists only TOTP so they could not remove it. Identical to the old
  behaviour, so not a regression — but now that the gate is local code it is cheap to pin. Not in
  scope here.
- **MFA is enforced only in the proxy.** No RLS policy in `supabase/schema.sql` checks `aal`.
  Pre-existing and architectural; Next's own proxy docs warn against treating middleware as a full
  authorization solution.

## Risk Assessment

**Silently disabling the gate.** The failure is invisible in normal use because most accounts have no
factor enrolled. Mitigations: required `Factor.status` so upstream drift is a compile error; the
fail-closed default; the blocking manual criterion above.

**`getSession()` making a network call.** `__loadSession` calls `_callRefreshToken` when the token is
within `EXPIRY_MARGIN_MS` (90 s) of expiry. `getUser()` normally absorbs that first, but a token
crossing the boundary mid-request can trigger it. Consequence is perf only: a successful refresh
preserves the `aal` claim, and a failed one yields a null session, which fails closed. Not a
regression — the old code called `getSession()` at the same point.

**Caching a rejection (Phase 2 interaction).** `requireUser` now caches its throw, so a transient
Supabase outage yields a sticky `"Not authenticated"` for the whole request rather than an incidental
retry. Fails closed; the message is misleading for a network fault. Accepted.
