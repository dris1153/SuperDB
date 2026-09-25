---
title: "JWT Keys settings page"
status: completed
created: 2026-09-25
blockedBy: []
blocks: []
---

# JWT Keys

The signing keys that mint this project's JWTs, and the lifecycle that replaces one. Fills the gap
between API Keys and the rest of Configuration in the settings nav.

Two reports stand behind this, and they disagree:

- [260925-1157-jwt-signing-keys-measured.md](../reports/260925-1157-jwt-signing-keys-measured.md) —
  the API, measured. **This one wins.** Its second half ran the whole lifecycle against a scratch
  project restored for the purpose.
- [260925-1159-jwt-signing-keys-research.md](../reports/260925-1159-jwt-signing-keys-research.md) —
  the documentation. Useful for intent, wrong in three places the measurement corrects.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The read path](phase-01-read-path.md) | **done** | ~3h | — |
| 2 | [Create a standby key, and rotate](phase-02-create-and-rotate.md) | **done** | ~3h | 1 |
| 3 | [Revoke and delete](phase-03-revoke-and-delete.md) | **done** | ~3h | 2 |
| 4 | [The legacy JWT secret tab](phase-04-legacy-tab.md) | **done** | ~2h | 1 |
| 5 | [Matching the dashboard's layout](phase-05-ui-parity.md) | **done** | ~3h | 4 |

## What the measurement settled

Each of these was an open design question before 2026-09-25 and is now closed by an observation.
None of them should be re-derived from the OpenAPI spec, which is wrong about two.

- **Rotation is one request.** `PATCH {status:"in_use"}` on a standby key demotes the current key to
  `previously_used` by itself. There is no two-call sequence and therefore no half-rotated state.
- **Sessions survive a rotation.** `previously_used` keys stay in JWKS, so tokens they signed keep
  verifying. Revocation is what breaks tokens, not rotation.
- **`standby` and `previously_used` keys are both in JWKS**; revoked ones are not. A standby
  appears about a minute after creation, which is the point of standby: clients cache the new public
  key before it signs anything. Publication is the whole difference between `previously_used` and
  `revoked`, and it was confirmed on a second pass after the first reading turned out to be
  indistinguishable from an edge cache.
- **Delete has a thirty-day grace period after revocation, and the 422 states the date.** Nothing
  in this app computes it.
- **The ~5-minute throttle is per project and exempts revocation.** It guards replacing the signing
  key, not withdrawing one, and the 429 states the moment it lifts.
- **EdDSA is in the enum and refused by the API.** The picker offers ES256 and RS256.
- **Revoking the legacy HS256 key returns 200 with no warning**, although `anon` and `service_role`
  are JWTs signed by it. Every word of caution on that path is written by this app.

## Settled decisions

- **One part, `signing-keys`, TTL 0.** Not because it carries a credential — `private_jwk` is never
  returned, so this page displays no secret at all — but because every control on it writes, and a
  cached copy would show the state from before the click.
- **No `private_jwk` input.** The API accepts an imported private key on create. A web form asking
  someone to paste one is not worth building, and would be the only place in this app where a
  private key crosses the wire inbound.
- **API error text is shown verbatim.** Four of the measured failures carry a timestamp the UI has
  no other way to know. Rewriting them into friendlier prose would throw away the only part that
  matters.
- **`jwt_exp` is read from the project**, not hard-coded to 3600. It is configurable, and the revoke
  warning is a statement about how long old tokens live.
- **Delete is attempted, not predicted.** No thirty-day countdown in the client; press the button
  and show what came back.
