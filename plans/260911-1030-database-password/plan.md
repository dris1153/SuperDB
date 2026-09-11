---
title: "The database password"
status: pending
created: 2026-09-11
blockedBy: []
blocks: []
---

# The database password

The Connect sheet prints `[YOUR-PASSWORD]` in every connection string, because the Management API
does not return a database password and resetting one is destructive. This stores it in the existing
vault — encrypted in the browser, opaque to the server — and substitutes it into the strings so they
are copy-pasteable.

Design, the constraint that made it possible, and what was settled without asking:
[260911-1022-database-password-brainstorm.md](../reports/260911-1022-database-password-brainstorm.md).
**Read it before starting.**

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Schema and actions](phase-01-schema-and-actions.md) | pending | ~2h | — |
| 2 | [Shared vault secret hook](phase-02-vault-secret-hook.md) | pending | ~2h | — |
| 3 | [Field and substitution](phase-03-field-and-substitution.md) | pending | ~3h | 1, 2 |

Phases 1 and 2 are independent. Phase 2 refactors shipped code and is worth landing alone, so a
regression there is not tangled up with new behaviour.

## The constraint that made this possible

`DirectPanel` lives in `components/connect-sheet.tsx`, which is `"use client"`, and builds its
connection strings as plain template literals. They do **not** go through the server-side Shiki
pipeline that renders the Framework tab — `lib/highlight.ts` is `server-only`.

So substitution happens in the browser and the vault stays zero-knowledge. Had the Direct tab been
server-highlighted like its neighbour, this feature would have been impossible without breaking the
vault's central promise. Recorded because it is not obvious that two tabs of one sheet render by
different mechanisms.

## Settled decisions

Do not re-open these during implementation:

- **Per project, keyed by ref.** Each Supabase project has its own database password, so
  `connection_secrets` — keyed by connection — is the wrong granularity. Same shape as
  `project_order`, for the same reason: projects are not this app's data.
- **Not a security escalation.** The vault already holds the Supabase dashboard password, which can
  *reset* the database password. Adding this does not make a vault compromise meaningfully worse.
- **The password cannot be validated.** The API never returns it, so a typo produces a silently wrong
  connection string. Say so in the UI rather than implying it was checked. **Do not build a "test
  connection" feature to compensate.**
- **Substitute structurally, not by matching the placeholder.** See phase 3.
- **The password appears in plain text** whenever the vault is unlocked and the Direct tab is open,
  unlike every other vault field. Deliberate: a connection string with the password masked is not a
  connection string. Masked-by-default with a reveal toggle is a one-line change if it turns out to
  matter.

## Cross-plan notes

**[260911-0910-project-drag-ordering](../260911-0910-project-drag-ordering/plan.md)** adds
`project_order` to `supabase/schema.sql`; phase 1 here adds `project_secrets` to the same file.
Different tables, no conflict — but whichever lands second means one more run of the file.

**[260910-0042-navigation-latency](../260910-0042-navigation-latency/plan.md)** phase 6 touches
`lib/inventory.ts`, which this plan does not. No overlap.

## Success metrics

- Vault unlocked with a password saved: the direct, transaction pooler and session pooler strings all
  carry the real password.
- Vault locked: all three show the placeholder, exactly as today.
- Save, lock, unlock, reopen the sheet — the same password comes back.
- A blob that cannot be decrypted blocks saving instead of overwriting it.
- **The server never receives plaintext** — verify by inspecting the request payload, not by reading
  the code.
- The connection credentials form behaves identically after phase 2.
- `pnpm test` (294 today), `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green.
