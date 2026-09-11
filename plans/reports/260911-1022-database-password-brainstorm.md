---
type: brainstorm-report
date: 2026-09-11
scope: storing a project's database password in the vault
branch: perf/navigation-latency
head: e2af4f3
---

# The database password

## Problem statement

The Connect sheet's Direct tab prints `[YOUR-PASSWORD]` in every connection string, because the
Management API does not return a database password and resetting one is destructive — so the README
sends people to Supabase's own dashboard for it.

Asked for: store that password in the vault, viewable and editable, still gated behind the master
password, so the connection string is copy-pasteable.

## The constraint that decided the design

The vault is zero-knowledge: the server never holds plaintext. That is only compatible with this
feature if the substitution happens in the browser.

`DirectPanel` lives inside `components/connect-sheet.tsx`, which is `"use client"`, and its connection
strings are built as plain template literals. They do **not** go through the server-side Shiki
pipeline that renders the framework snippets (`lib/highlight.ts` is `server-only`).

**So substitution is client-side and the zero-knowledge property survives.** Had the Direct tab been
server-highlighted like the Framework tab, this feature would have been impossible without breaking
the vault's central promise. Worth recording, because it is not obvious from the outside that two tabs
of the same sheet render by different mechanisms.

## Decisions

| Question | Decision |
|---|---|
| Where it surfaces | Connect sheet, Direct tab — where the placeholder already is |
| Substitution | Into the connection string; `[YOUR-PASSWORD]` returns when the vault is locked |
| Pooler strings | Substituted too, structurally (see below) |
| Granularity | Per project, keyed by ref |

### Settled without asking

**Per project, not per connection.** Each Supabase project has its own database password. One
connection covers many projects, so `connection_secrets` is the wrong granularity. The new table keys
on the ref, exactly like `project_order` — and for the same reason: projects are not this app's data.

**Not a security escalation.** The vault already holds the Supabase dashboard password, which can
*reset* the database password. Adding the database password does not make a vault compromise
meaningfully worse. Worth stating so nobody re-litigates it later on instinct.

**The password cannot be validated.** The Management API never returns it, so the app has no way to
tell a correct password from a typo — unlike the master password, which has `check_blob`. A wrong
entry produces a silently wrong connection string. Accept it; do not build a "test connection"
feature to compensate.

## Structural substitution, not placeholder matching

`transactionPooler` and `sessionPooler` come back verbatim from the Management API, and **the exact
placeholder text it embeds is unknown here**. Matching on `[YOUR-PASSWORD]` would be a guess.

Every one of these strings is a URI of the shape `scheme://user:password@host:port/db`. Replacing the
segment between the last `:` of the userinfo and the `@` works whatever the placeholder says. The
assumption disappears rather than needing verification.

Still worth looking at one real pooler string once — to confirm the URI shape, not to learn the
placeholder.

`new URL()` was considered and rejected: `[` and `]` in the current placeholder sit in the userinfo,
where the URL parser's handling is lenient and percent-encoding may alter the string. A narrow regex
over the userinfo is more predictable here than a spec-compliant parser.

## Design

**Schema** — `project_secrets (user_id, project_ref, vault_blob, updated_at)`, composite primary key,
RLS `user_id = auth.uid()`, `revoke all from anon`. The same shape as the four tables beside it.

`vault_blob` holds JSON, not a bare string, for the reason already recorded on
`connection_secrets.vault_blob`: adding a field later becomes a JSON change rather than a migration.

**Flow** — the server reads the blob, which is ciphertext and meaningless to it, and passes it into
`ConnectInfo` as a prop. The client decrypts with the vault key and substitutes. The server never
sees plaintext at any point.

**Locked vault** — the string keeps `[YOUR-PASSWORD]`, which is exactly today's behaviour. The
degraded state needs no special handling because it *is* the current state.

## Do not copy connection-credentials.tsx

That component already holds the decrypt → edit → encrypt → save cycle this needs. It also held a
data-loss defect fixed earlier in this work: a failed decrypt left the password state empty, and
saving from there wrote a null blob over the real one, irreversibly.

This is the third time in this stretch of work that the right move has been to share a state machine
rather than copy it — the same reasoning produced `useOptimisticOrder`, and both times review
confirmed the copy would have reproduced the original's defects.

**Extract `useVaultSecret(blob, save)`**, carrying the `decryptFailed` guard with it, and have both
the connection credentials form and the new field use it.

## Risks

| Risk | Mitigation |
|---|---|
| Copying the credentials component reproduces its data-loss bug | The shared hook above; this is its main justification |
| A typo is undetectable | Inherent — the API cannot validate it. Say so in the UI rather than implying it was checked |
| The password shows in plain text on screen | A stated consequence of substituting into a visible string — see below |
| Pooler URI shape differs from the assumption | Structural replacement is shape-dependent even if placeholder-independent; look at one real string |
| Saving over an unreadable blob | The `decryptFailed` guard, inherited from the hook |
| Blob reaches a client that should not have it | It is ciphertext; the key never leaves the browser. Same exposure as `connection_secrets` today |

### The plain-text consequence, stated deliberately

Substituting into a visible connection string means the database password is on screen in plain text
whenever the vault is unlocked and the Direct tab is open. Every other password field in the vault is
`type="password"` behind a "Show passwords" checkbox.

That inconsistency is a deliberate choice, not an oversight: a connection string with the password
masked is not a connection string. Flagged so it stays a decision. Switching to masked-by-default with
a reveal toggle is a one-line change if screen-sharing turns out to matter more than convenience.

## Success metrics

- With the vault unlocked and a password saved, the Direct, transaction pooler and session pooler
  strings all carry the real password.
- With the vault locked, all three show the placeholder, exactly as today.
- Saving, locking, unlocking and reopening the sheet returns the same password.
- A blob that cannot be decrypted blocks saving instead of overwriting it.
- The server never receives plaintext — verifiable by inspecting the request payload.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green (294 tests today).

## Next steps

Medium size: a schema change, a read/write path, a shared-hook extraction from shipped code, and the
substitution. Worth a plan.

Suggested phases: schema and actions · shared vault-secret hook extracted from the credentials form ·
the field and the substitution in the Direct tab.

## Open questions

- The exact URI shape of the pooler strings. One look at a live sheet settles it.
- Whether masked-by-default is wanted after seeing the plain-text version in use.
- Whether the same field belongs on the overview's Primary Database card later. Out of scope; the
  Connect sheet is where the string is used.
