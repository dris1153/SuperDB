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
