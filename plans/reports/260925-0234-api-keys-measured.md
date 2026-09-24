# API keys, measured

2026-09-25, against `ddfvxjfbazumqvoweehn` in `ACTIVE_HEALTHY`, with a **personal access token**
(`sbp_…`). The project had to be resumed first — both projects on this account were `INACTIVE`, and a
paused project answers `GET /api-keys` with an empty array, which is not the same as having no keys.

Everything here is a response, not a reading of the spec. Where they disagree, the spec is wrong.

## `reveal=false` masks some keys and not others

| Key | `type` | `api_key` at `reveal=false` |
|---|---|---|
| `anon` | `legacy` | **complete** 208-char JWT, unmasked |
| `service_role` | `legacy` | **complete** 219-char JWT, unmasked |
| `default` | `publishable` | complete, 46 chars, unmasked |
| `default` | `secret` | 41 chars, of which **26 are `·`** — only the `sb_secret_xxxxx` prefix is real |

So both prior claims were half right. The OpenAPI spec says `reveal=false` redacts `api_key`: true of
the new `secret` type, **false of the legacy `service_role` JWT**. This repo's 2026-09-15 measurement
said the key comes back regardless: true of `service_role`, false of `secret`.

**The key that bypasses Row Level Security is the one that still comes back in full.** That is what
makes `KeySummary` in `lib/project-parts.ts` — which picks `id`, `name`, `prefix` and brands
`api_key?: never` — still necessary. The reasoning written there needs updating; the guard does not.

## `reveal=true` is refused, and not because of the parameter

```
GET /v1/projects/{ref}/api-keys?reveal=true
403 {"message":"Your account does not have the necessary privileges to access this endpoint. …"}
```

Same 403 for `reveal=1`, `True`, `TRUE`, `yes`, `on` — so this is not the string-typed parameter being
mis-parsed. Same 403 on the single-key form, `GET /api-keys/{id}?reveal=true`.

The masked value is what comes back everywhere else too: `POST` answers **201** with the new key
already masked, and `DELETE` answers **200** with the deleted key masked. The `hash` field is 43
base64url characters — a SHA-256 digest, one-way.

**With this token there is no route to a full `sb_secret_` value.** Whether an OAuth connection or a
differently-scoped PAT changes that is being researched separately; it decides whether a Reveal button
can exist at all.

## An existing bug this turned up

`lib/connect-actions.ts:25` calls `listApiKeys(token, ref, true)` — `reveal=true`. That is the call
measured above returning 403 on a healthy project with a PAT. The Server tab of the Connect sheet
therefore fails into `blocked: true` with the upstream message, which reads exactly like a missing
OAuth scope.

It does not need `reveal=true`: the publishable key comes back complete at `reveal=false`. Only the
secret key is unavailable, and it is unavailable by any means.

## 400 exists, and the spec does not declare it

The spec lists only 200/201/401/403/429 for these endpoints. Invalid bodies get **400** with precise
messages:

| Body | Response |
|---|---|
| `{}` | `type: Invalid option: expected one of "publishable"\|"secret",name: Invalid input: expected string, received undefined` |
| `{type:"secret"}` | `name: Invalid input: expected string, received undefined` |
| `{type:"secret",name:""}` | `name: Too small: expected string to have >=4 characters` + the pattern message |
| `{type:"secret",name:"Bad-Name"}` | `name: Name must start with a lowercase letter or an underscore, followed only by lowercase alphanumeric characters or underscore` |
| `{type:"secret",name:"a".repeat(200)}` | `name: Too big: expected string to have <=64 characters` |

So: `name` is 4–64 characters matching `^[a-z_][a-z0-9_]*$`, and `type` is one of two values and
cannot be changed later (`PATCH` accepts only `name`, `description`, `secret_jwt_template`).

`description` was **not** rejected at 5,000 characters — that request returned 201 and created a real
key, which was deleted immediately afterwards (`DELETE` → 200, list back to the original four).

## Rate limits

`x-ratelimit-limit: 120` per 60s on both `/api-keys` and `/api-keys/legacy` — the ordinary limit, not
the 10/60s the metrics endpoint carries.

## Legacy toggle

`GET /api-keys/legacy` → `{"enabled": true}`. One project-wide flag covering **both** `anon` and
`service_role`. `PUT` takes `enabled` as a **required query parameter**, not a body — the spec is
right about that and the earlier research summary was not.

**Not measured, deliberately.** Turning it off disables the anon key, which is what nearly every
client application in the wild authenticates with. That is not something to try on a real project to
see what happens.


---

# A second token, and what it proves

2026-09-25, a freshly created personal access token replacing the first.

| Call | first token | second token |
|---|---|---|
| `GET /v1/projects` | 200 | 200 |
| `GET /api-keys` | **200**, four keys | **403** |
| `GET /api-keys?reveal=true` | 403 | 403 |
| `GET /api-keys/legacy` | **200** `{"enabled":true}` | **403** |

The second token is *less* capable: it cannot even list. So it lacks `api_gateway_keys_read`, while
the first had that and lacked `api_gateway_keys_secret_read`.

**That is the useful result.** Two tokens on the same account, differing only in scopes, produce three
different outcomes on the same endpoint — which confirms the permission model the research described
is real and enforced, and that `reveal=true` is gated by a scope rather than switched off for
everyone. What has still not been produced is a token holding *both* scopes, so whether reveal returns
an unmasked key when fully authorised remains unmeasured.

Both tokens are `sbp_…` personal access tokens, so the difference is scope selection at creation time,
not token kind.


---

# Settled: `reveal=true` works, and the 403 was scope, not the API

2026-09-25, a third personal access token — scoped, **preset "Full access"**, resource access set to
an *organization*. It sees two projects, neither of them the ones the first two tokens saw: this
account has more than one organization, and a token scoped to one cannot reach the others. That alone
explains the 403s above, which had looked like a missing permission on the endpoint.

On a project inside its own organization:

| Key | `reveal=false` | `reveal=true` |
|---|---|---|
| `anon` (legacy) | complete | complete |
| `service_role` (legacy) | complete | complete |
| `publishable` | complete | complete |
| **`secret`** | **41 chars, 26 of them `·`** | **41 chars, complete** |

So the reveal path is real and a Reveal button is buildable. What gates it is the token's reach —
organization scope and the api-keys permissions together — not a platform decision to withhold
secrets from everyone.

## The trap this leaves behind

**A masked secret and a complete one are the same length.** 41 characters either way. Any code that
decides "is this the real key" by measuring the string is wrong on both sides: it will treat a mask as
a key, and offer to copy 26 dots.

The test is the mask character `·` (U+00B7), not the length. That belongs in whatever parses this
response, with this measurement as the reason.

## What is now known about the earlier 403s

The first token listed keys but was refused `reveal=true`; the second was refused everything; the
third succeeds at both. All three are `sbp_…` tokens on the same account. The variables are the
organization a token is scoped to and the permissions preset chosen at creation — and the failures
seen earlier are consistent with a token simply not reaching those projects.

**Unchanged by this:** `service_role` comes back complete at `reveal=false` with no special
permission, on every project measured. The guard in `lib/project-parts.ts` stays exactly as it is.


---

# Writes are rate limited harder than the headers admit

Measured while verifying create / rename / delete end to end.

`POST` → `PATCH` → `DELETE` fired back to back, inside a second, on a key that had just been created:

```
create -> 201
rename -> 429
delete -> 429
```

Yet the very next `GET` reported `x-ratelimit-limit: 120, remaining: 117`. The same three calls spaced
five seconds apart all succeeded:

```
create -> 201 superdb_probe
rename -> 200 superdb_probe2 | "renamed"
delete -> 200
```

So there is a burst limit on the write path that **the rate-limit headers do not describe** — they
keep reporting the ordinary 120/60s read budget while the write is refused. Nothing in the spec
mentions it either.

**What this means for the page.** A UI that fires writes in quick succession — a create followed by
an immediate rename, or a delete loop over several rows — will be refused, and the refusal arrives as
429 with headers that say there was plenty of budget left. Treat 429 on a write as "too fast", not as
"quota exhausted", and do not build anything that batches writes without spacing them.

**A key was left behind by the first attempt** — the rename and delete both failed, so `superdb_probe`
survived and the list showed five keys. It was deleted a minute later and the list is back to the
original four: `anon`, `service_role`, and the two `default`s. Worth recording because a half-finished
sequence against a live project is exactly the state a retry loop would leave, and the UI has to
assume it can happen.
