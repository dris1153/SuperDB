---
name: mgmt-api-types-are-subsets
description: lib/mgmt-api.ts types are hand-written subsets, not runtime shapes — call() returns the whole upstream body, so any reader handed to a client leaks every unmodelled field
metadata:
  type: project
---

Every type in `lib/mgmt-api.ts` (`Branch`, `ApiKey`, `Addon`, `PoolerConfig`, …) is a hand-written
subset of what Supabase actually returns. `call()` does `JSON.parse(text)` and casts — it strips
nothing. A reader typed `Promise<Branch[]>` resolves to the full upstream objects at runtime.

Two measured landmines:
- `GET /v1/projects/{ref}/api-keys` returns the real `api_key` value **even at `reveal=false`**, plus
  `hash` and `secret_jwt_template` which the `ApiKey` type does not mention. `reveal` is not a
  security boundary. `lib/framework-actions.ts` depends on this behaviour.
- `GET /v1/projects/{ref}/billing/addons` returns `available_addons` (the whole priced catalogue)
  alongside `selected_addons`.

The cast bites scalars too, not only credentials: `getAuthConfig` is typed `{jwt_exp?: number}` and
whatever arrives is handed straight to a formatter. A value that is not a number renders as one —
`"NaN hours"`, `"true seconds"` — and when that string is the wait printed in front of a destructive
confirm, the subset type is the only thing standing between the API and a false promise. A
`Number.isFinite` check belongs in the reader, beside the `.map()`.

**Why:** this was safe while every read was consumed inside a server component, which rendered only
the named fields. It stops being safe the moment a value is returned from a route handler or a server
action.

**How to apply:** on any review where a `mgmt-api` result crosses to a browser, do not trust the
declared type. Check the upstream schema (`curl https://api.supabase.com/api/v1-json`) and require an
explicit `.map()` to the fields the UI renders. Related: [[action-error-text-redacted]].
