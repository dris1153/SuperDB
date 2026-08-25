# Secret rotation runbook

Three secrets can force every user out if rotated carelessly. Read the relevant section before
touching any of them.

## `ENCRYPTION_KEY`

Wraps the per-connection data key that encrypts every stored token.

**Rotating it today destroys access to every stored token.** There is no dual-key read path: `open()`
resolves `dek_wrapped` with whatever `ENCRYPTION_KEY` currently holds, and a key that did not wrap it
fails authentication. Every user would have to reconnect.

That is acceptable for a single-operator instance. It is not acceptable once strangers depend on it.

**Emergency rotation (key believed compromised), accepting the outage:**

1. Generate a new key: `npm run genkey`
2. Replace `ENCRYPTION_KEY` and redeploy
3. `truncate public.connections;` — the rows are unreadable now and only cause confusing errors
4. Tell users to reconnect

**What a zero-downtime rotation needs** (not built):

- `ENCRYPTION_KEY_PREVIOUS` read from the environment
- `open()` tries the current key, falls back to the previous one
- A rewrap job: for each row, `open()` with either key, `seal()` with the current one, bump the
  `dek_wrapped` prefix from `v1.` to `v2.`
- Remove `ENCRYPTION_KEY_PREVIOUS` once no `v1.` rows remain

The `v1.` version prefix written by `seal()` exists precisely so this can be added without a data
migration. Budget half a day.

## `SB_OAUTH_CLIENT_SECRET`

Authenticates this app to Supabase when exchanging and refreshing OAuth tokens.

Rotate it in the Supabase dashboard under *Organization settings → OAuth Apps*, then update the
environment variable and redeploy.

**Unverified:** whether rotating the client secret invalidates refresh tokens already issued to the
old secret. Supabase does not document this. Test on one connection before rotating in anger — if
refresh breaks, every OAuth connection needs re-authorization and users will see "Reconnect required"
on the connections page, which is at least a clear signal rather than silent failure.

Access tokens live 24 hours, so any breakage surfaces within a day whether or not you look.

## `SUPABASE_ANON_KEY`

Public by design; it appears in browser traffic for any normal Supabase app. Rotating it is a
configuration change, not a security event. RLS is what protects the data, not this key.

## What is *not* rotatable from here

Users' own Supabase access tokens and OAuth grants. Revoking those is their action, in their Supabase
settings. Disconnecting an OAuth connection in SuperDB does call `/v1/oauth/revoke`, but a pasted
access token is only forgotten locally — it stays valid upstream until the user revokes it.

Say this plainly to anyone reporting a compromise: **deleting the connection here is not the same as
revoking the credential.**
