# Brainstorm — credential vault on connections

Date: 2026-08-25 · Status: design approved, not implemented

## Request

Per connection, store the login credentials behind the Supabase account:

- Supabase account: sign-in method (email+password, GitHub, Google), the email used, the password
- The underlying provider account: its email and password

Stated purpose: keep Supabase accounts manageable in one place. Stated constraint: encrypt properly.

## What this actually is

Not a new field. The app currently holds **scoped Supabase access tokens** — revocable, expiring,
limited to the Management API. The request adds **account passwords**, including the email account
password, which is the root of trust for every other service the person owns.

There is also a terminology trap worth stating once. "Encrypt passwords properly" usually means
hashing with bcrypt or Argon2 — one-way, unreadable afterwards. That is the standard for storing
passwords *to check them*. This feature must show passwords back, so it needs **reversible**
encryption, and no standard makes that safe the way hashing is. What makes it safe is that the server
cannot decrypt at all.

So: this is a password manager, and it is scoped as its own project rather than a field in the Edit
dialog.

## Decisions

| Question | Decision | By |
|---|---|---|
| Purpose | Real vault — able to log in from here, not just identity metadata | user |
| Architecture | Hybrid: tokens stay server-side, passwords go zero-knowledge | user |
| Audience | Unknown; build for strangers from day one | user |
| TOTP seeds | Out of scope | user |

Advisor recommendations that were accepted: hybrid over uniform, and zero-knowledge up front. The
second matters most — moving from server-side to zero-knowledge later would force every user to
re-enter every password, because the server would have no way to migrate what it can no longer read.

## Why hybrid, not one scheme for everything

The two secret types have genuinely different requirements, and that asymmetry is the whole design:

| | Access tokens | Passwords |
|---|---|---|
| Who must read them | The server, unattended — background OAuth refresh, every page load | Only the user, at a keyboard |
| Where decryption happens | Server (`seal`/`open`, unchanged) | Browser only |
| Can the operator decrypt | Yes, necessarily | **No** |

Reusing `seal()`/`open()` for passwords is rejected not because it is weak but because it *requires*
the server to be able to read — which passwords never need. Encrypting everything client-side is
rejected for the opposite reason: it would break unattended token refresh and force a vault unlock on
every page load.

## Crypto design

```
master password  (separate from the login password)
   │  PBKDF2-HMAC-SHA256 · 600,000 iterations · 16-byte random salt
   ▼  WebCrypto, native — no new dependency
vault key (256-bit, AES-GCM, non-extractable CryptoKey)
   │  AES-GCM · fresh 96-bit IV per blob
   ▼
vault_blob  →  server stores ciphertext only
```

600,000 iterations is OWASP's current PBKDF2-HMAC-SHA256 figure. Re-check it at implementation time;
it has risen before and will again.

**Master password must be separate from the login password.** Supabase Auth sees the login password
at sign-in, and a password reset would otherwise destroy every vault entry.

**Wrong-password detection**: a per-user `check_blob` — AES-GCM over a known constant, written at
vault setup. Without it there is nothing to verify against before the user has stored anything, and a
wrong master password would look like corrupted data.

**Key lifetime**: derived on unlock, held as a **non-extractable** `CryptoKey`. Stored in IndexedDB so
it survives a page reload — structured clone supports `CryptoKey`, and a non-extractable key cannot be
exported back to JavaScript. Auto-expire it after a few hours, plus an explicit Lock button.

Honest limit: while the vault is unlocked, XSS on this origin can *use* the key to decrypt, even
though it cannot exfiltrate the key itself. That is true of every in-browser password manager and
should not be dressed up as solved.

## Schema

Identity stays plaintext and queryable — it is what answers "whose account is this org", the original
goal. Only the passwords become opaque.

```sql
create table public.vault (
  user_id     uuid primary key references auth.users on delete cascade,
  kdf         text not null default 'PBKDF2-SHA256',
  iterations  int  not null,
  salt        text not null,        -- base64; not secret
  check_blob  text not null,        -- AES-GCM of a known constant
  created_at  timestamptz not null default now()
);

create table public.connection_secrets (
  connection_id         uuid primary key references public.connections on delete cascade,
  user_id               uuid not null default auth.uid() references auth.users on delete cascade,
  supabase_login_method text check (supabase_login_method in ('email', 'github', 'google')),
  supabase_email        text,
  provider_email        text,
  vault_blob            text,       -- client-encrypted {"supabase_password": "...", "provider_password": "..."}
  updated_at            timestamptz not null default now()
);
```

RLS on both, `user_id = auth.uid()`, same shape as `connections`.

Storing both passwords in one blob rather than one column each keeps a single IV and makes adding a
field later — TOTP seeds, recovery notes — a JSON change with no migration.

## Server API

The server is deliberately dumb about the blob:

- `saveSecrets(connectionId, identity, vaultBlob)` — validates the identity fields, stores the blob verbatim
- `getSecrets(connectionId)` — returns identity plus the blob; the client decrypts
- `setupVault(salt, iterations, checkBlob)` / `getVaultMeta()`

No server-side validation of blob contents is possible, by design. The server cannot tell a real
password from noise.

## UI

- **Vault unlock** — a dialog when a page needs the vault; not on login
- **Edit connection** gains a Credentials section: sign-in method, emails (plaintext), password fields
  (reveal + copy, disabled until unlocked)
- **Settings** gains vault setup, change master password, and Lock
- Plain warning where passwords are entered, naming the email password as the highest-value item

Changing the master password decrypts every blob client-side and re-encrypts — acceptable, there are
few rows.

## Risks

| Risk | Reality |
|---|---|
| Lost master password | Unrecoverable by design. Combined with Supabase MFA having no recovery codes, the user now has two unrecoverable states. Say so at setup. |
| XSS while unlocked | Can decrypt. Mitigated, not eliminated, by non-extractable keys and auto-expiry. |
| Self-written crypto | WebCrypto primitives, no hand-rolled algorithms — but composition bugs are still possible and fail silently. Needs unit tests over derive/encrypt/decrypt/wrong-key/tamper. |
| Competing with audited password managers | This will be less scrutinised than 1Password or Bitwarden. Users should be told what it is. |
| Users typing an email password into a third-party site | Inherent to the feature. Unavoidable once the decision is made. |

## Success criteria

- A password saved on one device can be read on another after unlocking with the master password
- The database contains no readable password: dumping `connection_secrets` yields only ciphertext
- A wrong master password is rejected cleanly via `check_blob`, not as a decryption error
- Changing the master password preserves every stored credential
- Locking, or a reload after expiry, requires unlocking again
- Token behaviour is untouched: OAuth refresh still works with the vault locked

## Next steps

1. `lib/vault-crypto.ts` — derive / encrypt / decrypt, with tests including wrong-key and tampered-blob
2. Schema + RLS
3. Unlock context and IndexedDB key handling
4. Server actions (blob-opaque)
5. Edit dialog and Settings integration
6. Verify the cross-device case by hand — it is the one that proves the server never held plaintext
