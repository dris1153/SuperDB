# JWT signing keys, measured

2026-09-25, against `nnjdwpswuynozmzfaioc` (`ACTIVE_HEALTHY`) with a full-access personal access
token. This is the same project in the user's screenshots, so the values below are the ones on screen.

**Reads only.** `POST` and `PATCH` were deliberately not sent: rotating or revoking a signing key on a
live project can invalidate every session it has issued, and that is not something to learn by trying.

## What the list returns

`GET /v1/projects/{ref}/config/auth/signing-keys` → **`{ "keys": [...] }`**, an object, **not a bare
array** — unlike `/api-keys` on the neighbouring page, which does return an array. One page, two
shapes, and a reader written from the other one's habit will read `undefined`.

| `status` | `algorithm` | `public_jwk` |
|---|---|---|
| `in_use` | ES256 | present — `{kty:"EC", crv:"P-256", alg:"ES256", key_ops:["verify"], kid, x, y}` |
| `previously_used` | HS256 | **null** |

Fields per key: `id`, `algorithm`, `status`, `public_jwk`, `created_at`, `updated_at`.

`GET …/signing-keys/{id}` returns the same six fields. **`private_jwk` is never returned** — it only
appears as an optional field on create. So tab one of this page displays no secret at all.

`GET …/signing-keys/legacy` returns the HS256 key on its own, same shape.

## JWKS serves only the key in use

```
GET https://{ref}.supabase.co/auth/v1/.well-known/jwks.json
200 — keys: ES256 0e9ce054-…
```

The `previously_used` HS256 key is **absent**, which follows: a shared secret has no public half to
publish. So a token signed by the old HS256 key cannot be verified by anyone through JWKS — only
Supabase can verify it, holding the secret. Anything relying on JWKS verification sees only the
current asymmetric key.

## Token lifetime, which decides the safe waiting period

`GET /v1/projects/{ref}/config/auth` has no `jwt_secret` field, but it does have:

```
jwt_exp = 3600
```

One hour. The dashboard's own copy says *"These JWT signing keys are still used to verify tokens that
are yet to expire. Revoke once all tokens have expired"* — and this is the number behind that
sentence, at least for this project. It is configurable, so a page that hard-codes an hour would be
wrong on a project that changed it.

## The legacy JWT secret cannot be read through this API

The screenshot's second tab has a **Reveal** control on the legacy JWT secret. Nothing in the
Management API returns it:

- `…/signing-keys/legacy` returns `{id, algorithm, status, public_jwk, created_at, updated_at}` —
  `public_jwk` is null for HS256 and there is no secret field.
- The only other path mentioning secrets is `/v1/projects/{ref}/secrets`, which is Edge Function
  secrets — a different thing entirely.

So the dashboard reads it through something that is not the public Management API. **This app cannot
build that Reveal.** The same shape of limitation as the database password: metadata yes, value no.

## The write surface, from the spec

```
POST   /signing-keys        {algorithm*, status?, private_jwk?}
       algorithm: EdDSA | ES256 | RS256 | HS256
       status:    in_use | standby
PATCH  /signing-keys/{id}   {status*}
       status:    in_use | previously_used | revoked | standby
DELETE /signing-keys/{id}
GET,POST /signing-keys/legacy      — POST takes no body
```

`private_jwk` on create means a key can be **imported**, not only generated. A UI that exposes that
is asking someone to paste a private key into a web form.

No 4xx beyond 401/403/429 is declared. On the API keys page the same was true and the API returned
detailed 400s anyway, so the declaration means little.

## Rate limit

`x-ratelimit-limit: 120` per 60s on the list. The API keys page turned up a **burst** limit on writes
that these headers do not describe — three writes inside a second gave 201, 429, 429 while the headers
reported plenty left. Whether the same applies here is unmeasured, and a rotation is exactly the kind
of two-step write that would hit it.

---

# The lifecycle, measured

Everything above was read-only against the live project. The writes below ran against
`vhfmvfpcbaldzgknbtcm`, a paused project restored for the purpose and paused again afterwards. It
started in the same shape as the real one: HS256 `previously_used` + ES256 `in_use`.

This section supersedes the "reads only" note above and, where they disagree, it supersedes
`260925-1159-jwt-signing-keys-research.md` — that report is documentation, this is the API.

## Rotation is one call, not two

```
POST   /signing-keys {algorithm:"ES256", status:"standby"}   201
PATCH  /signing-keys/{standby}  {status:"in_use"}            200
```

After the PATCH the list reads:

```
ES256:in_use:29b681e0        (was standby)
ES256:previously_used:b19aa0ed  (was in_use — demoted with no second call)
```

**The old key demotes itself.** So the two-call sequence feared earlier does not exist, and neither
does the half-rotated state where two keys are `in_use`. One button, one request.

Twelve seconds separated the POST and the PATCH and both succeeded, so there is no throttle
between *creating* a standby and *promoting* it.

## Which transitions are blocked, and for how long

| Attempt | Result |
|---|---|
| `DELETE` a `previously_used` key | **422** `Only keys with revoked status can be fully deleted.` |
| `DELETE` the `in_use` key | **422** same message |
| `PATCH previously_used → revoked` | **200** |
| `DELETE` immediately after revoking | **422** `This signing key cannot be removed at this time. Try again after 2026-10-25T05:59:46.997Z.` |
| `PATCH revoked → standby` | **429** `Please wait until 2026-09-25T06:04:10.312Z before attempting this request again.` |
| `PATCH previously_used → revoked` on a *second* key, inside that same window | **200** |

Three things follow, and each one decides a piece of the UI:

**The delete grace period is thirty days, and the API states the date.** Not "a while", as the docs
have it — a timestamp, thirty days after the revocation. Nothing here should compute that date; the
message carries it.

**The 5-minute throttle is per project, not per key** — the `POST` of an unrelated new key was
refused with the *same* deadline. But revocation is exempt: two revokes went through inside the
window. So the throttle guards *replacing* the signing key, not *withdrawing* one. A page that
greys out every button for five minutes after a rotation would be greying out the one action that
still works.

**The window is timed from the last promotion**, and again the API states the moment. Same rule as
the delete date: show what was returned.

## Revoking the legacy HS256 key is not treated as special

`PATCH` on the HS256 `previously_used` key returned 200 with no warning, no confirmation step and no
mention of `anon` or `service_role` — which are JWTs signed by that key. The API will let someone
revoke it in one call. If this page offers that button, the warning has to come from this page,
because nothing upstream supplies one.

## Algorithms: the enum and reality disagree

```
POST algorithm=EdDSA  -> 422  Creating EdDSA signing keys is currently not supported
POST algorithm=ES512  -> 400  algorithm: Invalid option: expected one of "EdDSA"|"ES256"|"RS256"|"HS256"
```

EdDSA is in the enum the 400 prints and is still refused by the 422. So the spec's enum is not the
list of things that can be created, and a picker built from it offers an option that always fails.
Offer ES256 and RS256.

## JWKS

Corrected later the same session. The first reading here said standby keys are not published, from
a fetch a few seconds after the POST. A second standby, checked a minute after its POST, **was**
present. That first reading was the edge cache, not the behaviour.

```
+1m  JWKS kids: 6502e2e7(RS256 standby), 29b681e0(ES256 in_use)
     API:       HS256:revoked  RS256:standby  ES256:in_use  ES256:revoked
```

- `standby` keys **are** published, within about a minute of creation. This is what standby is for:
  clients fetch and cache the new public key before it ever signs anything, so the switch costs no
  verification failures.
- `previously_used` keys **are** published. Confirmed on a second pass, because the first reading
  was taken ~30s after a promotion and could not be told apart from an edge cache still serving the
  moment that key was `in_use`. Promoting a second time and watching past the cache:

  ```
  [+2m] API: ES256:previously_used:29b681e0  RS256:in_use:6502e2e7   JWKS: 6502e2e7, 29b681e0
  [+5m] API: ES256:previously_used:29b681e0  RS256:in_use:6502e2e7   JWKS: 29b681e0, 6502e2e7
  ```

  This is what lets tokens signed by the outgoing key keep verifying after a rotation, and it is the
  whole basis of the rotate confirm saying nobody is signed out.
- `revoked` keys are **dropped** from JWKS. Publication is the full extent of the difference between
  `previously_used` and `revoked`, and it is exactly why revoking is the destructive step.
- The HS256 key is never published, having no public half.

## RS256 is real

```
POST algorithm=RS256 -> 201  status=standby  public_jwk.kty=RSA  n=342 chars (2048-bit)
```

Measured after the throttle window lifted. So of the four names in the enum, two can be created
(ES256, RS256), one is refused outright (EdDSA) and one is the symmetric legacy (HS256).

## JWKS, watched for 25 minutes

The corrected reading is stable, not a transient:

```
+1m / +4m / +8m / +12m   JWKS kids: 6502e2e7(RS256 standby), 29b681e0(ES256 in_use)
                         API:       HS256:revoked  RS256:standby  ES256:in_use  ES256:revoked
```

Both revoked keys stayed out of JWKS for the whole window, and the standby stayed in it. So the
publication rule is: `standby` and `in_use` and `previously_used` are served; `revoked` is not.

The scratch project was paused again afterwards.
