---
phase: 2
title: "Connections"
status: pending
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 2: Connections

## Overview

Replace `supabase_accounts` with `connections`, supporting two kinds: a pasted PAT (full capability)
and a Supabase OAuth authorization (per-organization, slightly reduced capability). Tokens move to
envelope encryption. The inventory and detail pages learn to render both.

## Requirements

Functional:
- Connect a Supabase organization through OAuth without leaving the app.
- Still connect an account by pasting a PAT.
- OAuth access tokens refresh automatically before expiry, invisibly.
- Upstream revocation surfaces as "reconnect", not a broken page.
- A row is readable only by the user who created it.

Non-functional:
- No plaintext token ever reaches the browser.
- One connection kind failing must not blank the whole board — `loadInventory` already isolates per
  account; keep that property.

## Architecture

```
/connections
   ├─ "Connect with Supabase"  → /api/connect/start ─→ authorize (PKCE, state in httpOnly cookie)
   │                                                        │
   │                              /api/connect/callback ←───┘
   │                                 verify state → exchange code → read org → insert row
   └─ "Advanced: paste a token" → server action → GET /v1/profile → insert row
```

Envelope encryption, in `lib/crypto.ts` on top of the existing primitives:

```
DEK          = randomBytes(32)                    per connection
access_cipher= AES-256-GCM(DEK, token)
dek_wrapped  = "v1." + AES-256-GCM(KEK, DEK)      KEK from ENCRYPTION_KEY
```

The `v1.` prefix exists so a future KEK rotation can rewrap DEKs instead of re-encrypting every token.
While the KEK lives in an env var this is hygiene, not a security boundary — see the report.

### Schema

```sql
create table public.connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('pat','oauth')),

  sb_account_id  text,          -- gotrue_id, PAT only
  email          text,          -- PAT only
  org_slug       text,          -- OAuth only
  org_name       text,          -- OAuth only
  label          text,

  dek_wrapped    text not null,
  access_cipher  text not null,
  refresh_cipher text,          -- OAuth only
  expires_at     timestamptz,   -- OAuth only
  token_hint     text not null,

  created_at     timestamptz not null default now(),
  synced_at      timestamptz,
  last_error     text           -- set when a refresh fails; drives the "reconnect" state
);

alter table public.connections enable row level security;
create policy "own connections" on public.connections
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.connections from anon;

create unique index connections_identity
  on public.connections (user_id, kind, coalesce(sb_account_id, org_slug));
```

Migration: there is exactly one real row (the operator's own PAT), and the encryption scheme changes.
Do not write a data migration for it — create the new table, re-add the token through the UI, drop
`supabase_accounts`.

## Related Code Files

Create:
- `lib/oauth.ts` — authorize URL, code exchange, refresh, revoke
- `lib/connections.ts` — replaces `lib/accounts.ts`
- `app/api/connect/start/route.ts`
- `app/api/connect/callback/route.ts`
- `supabase/migrations/002-connections.sql`

Modify:
- `lib/crypto.ts` — add `seal()` / `open()` over the existing `encrypt()` / `decrypt()`
- `lib/crypto.test.ts` — round-trip, tamper, wrong-KEK for the envelope pair
- `lib/inventory.ts` — carry `kind`, make `accountEmail` nullable, group by org for OAuth rows
- `lib/mgmt-api.ts` — skip `getDiskUtil` / `listApiKeys` for OAuth connections
- `app/(app)/accounts/page.tsx` → `app/(app)/connections/page.tsx`
- `app/(app)/p/[ref]/page.tsx` — hide the two panels OAuth cannot fill
- `components/projects-board.tsx` — owner column shows email or org, with a kind badge
- `components/sidebar.tsx` — rename the nav entry
- `.env.example`, `README.md`

Delete:
- `lib/accounts.ts` (superseded by `lib/connections.ts`)

## Implementation Steps

1. **Crypto.** Add `seal(plain) -> { dekWrapped, cipher }` and `open(dekWrapped, cipher) -> plain`.
   Extend `lib/crypto.test.ts` with the same four cases the existing tests cover. `npm test` green
   before touching anything else.
2. **Schema.** Write and run `002-connections.sql`. Drop `supabase_accounts` only after the new table
   exists and the app builds.
3. **`lib/oauth.ts`.** Four functions, all server-only:
   - `authorizeUrl({ state, challenge })` — no `scope` parameter, it is deprecated; scopes come from the
     app registration.
   - `exchangeCode({ code, verifier })` — `POST /v1/oauth/token`, body
     `application/x-www-form-urlencoded`, credentials in an `Authorization: Basic
     base64(client_id:client_secret)` header. Both details are easy to get wrong and both are required.
   - `refreshTokens(refreshToken)` — same endpoint, `grant_type=refresh_token`.
   - `revoke(token)` — `POST /v1/oauth/revoke`, called on disconnect.
4. **`lib/connections.ts`.** Port `lib/accounts.ts`, keeping its safest habit: an explicit
   `SAFE_COLUMNS` list so ciphertext columns cannot leak into a client component by accident.
   - `listConnections()` — safe columns only
   - `connectionsWithTokens()` — decrypts, refreshing OAuth rows whose `expires_at` is within 5 minutes
   - `addPatConnection(pat, label)` — validate and name the row with a single `GET /v1/organizations`,
     exactly as the OAuth path does. **Do not call `/v1/profile`**: Supabase no longer issues
     user-scoped tokens, so it answers 403 for every token this app can be given. `email` stays null.
   - `addOAuthConnection(tokens)` — read `GET /v1/organizations` to name the row
   - `removeConnection(id)` — call `revoke()` first for OAuth rows
5. **Refresh handling.** Proactive refresh with a 5-minute margin, plus one reactive retry: if a
   Management call returns 401, refresh once and retry, and only then give up. On refresh failure write
   `last_error` and leave the row in place.
6. **Connect routes.** `/api/connect/start` generates a PKCE verifier and `state`, stores both in
   short-lived httpOnly cookies, redirects to the authorize URL. `/api/connect/callback` compares
   `state`, exchanges the code, inserts the row, clears the cookies, redirects to `/connections`.
   A mismatched `state` must abort, not proceed.
7. **`CONNECT_MODES`.** `(process.env.CONNECT_MODES ?? "pat,oauth").split(",")`. The connections page
   renders each form only if its mode is enabled, and each server action re-checks — a hidden form is
   not access control.
8. **Inventory.** `InventoryProject` gains `kind`; `accountEmail` becomes `string | null`. Sorting and
   the filter dropdown key off a single `owner` label: email for PAT rows, org name for OAuth rows.
9. **Detail page.** For OAuth connections skip the disk-util and api-keys calls entirely rather than
   letting them 401 through `safe()` — one less round trip, and the UI can say why the panel is absent.
10. **Connections page.** Two equal options, no "Advanced" disclosure — the measurements show neither
    dominates. State the real trade-off in one line each: OAuth expires and refreshes itself and the
    user can revoke it from their own Supabase settings; a scoped token additionally reaches disk usage
    and API keys but is pasted here and does not renew. A row with `last_error` renders a Reconnect
    button.
11. `npx tsc --noEmit && npx next build && npm test`.

## Success Criteria

- [ ] OAuth connect completes end to end and the org's projects appear on the board
- [ ] Pasting a PAT still works and still resolves the email automatically
- [ ] A user with two organizations can connect both and sees them as two distinct rows, not duplicates
- [ ] Project detail renders for both kinds; OAuth hides disk usage and API keys with a stated reason
- [ ] An expired access token refreshes without the user noticing
- [ ] Revoking the app in Supabase turns the row into a Reconnect prompt instead of an error page
- [ ] Disconnecting an OAuth row calls `/v1/oauth/revoke`
- [ ] A second account sees none of the first account's connections
- [ ] No ciphertext or plaintext token appears in any client payload
- [ ] `tsc`, `next build`, `npm test` all clean

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Concurrent requests both refresh, and one refresh token is invalidated | Proactive refresh with a margin plus a single reactive retry; treat a failed refresh as "needs reconnect" rather than retrying in a loop |
| Token endpoint rejects the request for using JSON or body credentials | Step 3 spells out form encoding and Basic auth; the spike already proved this exact shape works |
| Per-org rows look like accidental duplicates | Show org name and a kind badge in the owner column |
| Ciphertext leaking to the client through a `select("*")` | Keep the explicit `SAFE_COLUMNS` list from `lib/accounts.ts`; never `select("*")` on this table |
| Dropping `supabase_accounts` too early | Drop it only after the new table exists and the build is green |
