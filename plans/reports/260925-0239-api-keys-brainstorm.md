# The API Keys page

Brainstorm, 2026-09-25. From two screenshots of the Supabase dashboard's Settings → API Keys.

Sources, in the order they should be trusted:

1. [What was measured](260925-0234-api-keys-measured.md) — live responses, 2026-09-25
2. [Reveal and permissions](260925-0315-secret-key-reveal-research.md) — the scope that gates it
3. [The CRUD surface](260925-0100-api-keys-research.md) — from the OpenAPI spec, **and the spec is
   wrong in two places the measurements caught**

## What had to be measured before anything could be designed

Both projects on this account were `INACTIVE`. A paused project answers `GET /api-keys` with an empty
array — not an error, just nothing — so every early reading was meaningless. One project was resumed
(`ACTIVE_HEALTHY`) and everything below is from that.

### `reveal=false` masks some keys and not others

| Key | `type` | at `reveal=false` |
|---|---|---|
| `anon` | `legacy` | complete 208-char JWT |
| **`service_role`** | `legacy` | **complete 219-char JWT, unmasked** |
| `default` | `publishable` | complete, 46 chars |
| `default` | `secret` | 41 chars, **26 of them `·`** |

The spec says `reveal=false` redacts the key; this repo measured on 09-15 that it does not. **Both are
half right**: true of the new `secret` type, false of the legacy `service_role` JWT — which is the one
that bypasses Row Level Security. `KeySummary` in `lib/project-parts.ts` stays exactly as it is; only
the reasoning in its comment is now out of date.

### `reveal=true` is a permissions problem, not a dead end

403 with *"Your account does not have the necessary privileges"* — on a healthy project, with a PAT,
for `reveal=1`/`True`/`TRUE`/`yes`/`on` alike, and on the single-key form too. Research names the gate:
`reveal=true` needs both `api_gateway_keys_read` **and** `api_gateway_keys_secret_read`.

So the answer is not "the secret can never be shown". It is "this token lacks a scope", which is
something a user can act on — and which changes the design from an apologetic placeholder into a
button that works for whoever has the scope and explains itself to whoever does not.

Unresolved, and a step in the plan: whether a fresh full-access PAT gets past it, or whether
[issue #50244](https://github.com/supabase/supabase/issues/50244) — where the Full-access preset
omitted that scope — is still live.

**A constraint specific to this app:** `lib/oauth.ts:33` records that scopes are fixed when the OAuth
app is registered, not requested per authorization. So for OAuth connections this is not a code change
at all; it is a dashboard change plus, most likely, a re-authorization of every existing connection.

### 400 exists and the spec denies it

`name` is 4–64 characters matching `^[a-z_][a-z0-9_]*$`; `type` is `publishable | secret` and cannot be
changed after creation. Measured by sending deliberately invalid bodies, so nothing was created —
except one 5,000-character `description`, which was accepted, created a real key, and was deleted
immediately.

### An existing bug this turned up

`lib/connect-actions.ts:25` calls `listApiKeys(token, ref, true)`. That is the 403 above, so the
Connect sheet's **Server tab fails for every connection**, reading like a missing OAuth scope. It does
not need `reveal=true` — the publishable key is complete at `reveal=false`, and only the secret is
unavailable.

## Design

**One endpoint, two tabs.** `GET /api-keys` returns all four keys with a `type`; the tabs are filters
over one list. `/api-keys/legacy` holds only `{enabled}` — a single project-wide flag covering both
`anon` and `service_role`.

**Reveal is a real button.** It calls `reveal=true`; on 403 it names the missing scope rather than
printing "Forbidden", because the difference between those two sentences is whether the reader knows
what to do next.

**The dangerous part is not the Reveal button.** It is that `service_role` comes back complete with no
scope at all. Any reader that passes the response through leaks it — which is what `KeySummary`
already prevents and must keep preventing.

**Disabling legacy keys gets the project-name confirm**, the same shape as the database password
reset. One flag turns off both `anon` and `service_role`, and `anon` is what nearly every client
application authenticates with.

## Rejected

- **A Reveal button that is permanently disabled.** The 403 is a property of the token, not of the
  API. Disabling the control would make a token problem look like a missing feature.
- **Accepting the secret as pasted input**, the way the database password works. The two are not
  alike: a database password genuinely cannot be read back, while this one can — by a token with the
  right scope. Building a paste box would bake today's misconfiguration into the product.

## Risks

- **`service_role` is unmasked and bypasses RLS.** Every new reader on this page is a chance to
  pass it through.
- **The legacy switch has no undo in the UI sense**: re-enabling is one call, but everything that
  broke in between stayed broken.
- **Supabase is mid-migration.** Masking appeared within the last ten days; legacy keys are due to be
  removed late 2026. A page built tightly around today's four-key shape will need revisiting.

## Success criteria

- Both tabs render from one request, and each key's type decides where it appears.
- Reveal shows the secret when the connection has the scope, and names the missing scope when not.
- Create rejects a bad name **before** the request, with the measured rule, and reports the API's own
  message when it still refuses.
- Disabling legacy keys requires typing the project name and says what actually breaks.
- No response containing `service_role` is ever passed through to the browser whole.
- The Connect sheet's Server tab works again.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` stay green — 415 tests today.
