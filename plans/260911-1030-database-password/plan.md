---
title: "The database password"
status: pending
created: 2026-09-11
blockedBy: []
blocks: []
---

# The database password

The Connect sheet prints `[YOUR-PASSWORD]` in every connection string, because the Management API
does not return a database password. This stores it in the existing vault — encrypted in the browser,
opaque to the server — **resets it when the user no longer has one**, and puts it into the clipboard
so the strings are usable.

**Widened 2026-09-15.** The plan was written believing a reset was out of reach; it says "resetting
one is destructive" and stops there. `PATCH /v1/projects/{ref}/database/password` exists —
`{password}`, `minLength: 4` — read from the OpenAPI spec. That matters more than it sounds, because
**Supabase shows the database password exactly once, at project creation**: a page that can only
store one is an empty box most people cannot fill. Store and reset ship together, and the feature
grew a home of its own in Project Settings rather than a field tucked into the Connect sheet.

Design, the constraint that made it possible, and what was settled without asking:
[260911-1022-database-password-brainstorm.md](../reports/260911-1022-database-password-brainstorm.md).
**Read it before starting.**

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Schema and actions](phase-01-schema-and-actions.md) | **in-progress** | ~2h | — |
| 2 | [Shared vault secret hook](phase-02-vault-secret-hook.md) | **done** | ~2h | — |
| 3 | [Settings shell and General](phase-03-settings-shell.md) | **done** | ~2h | — |
| 4 | [Rename a project](phase-04-rename.md) | **done** | ~3h | 3 |
| 5 | [Password Manager: store](phase-05-password-manager-store.md) | **in-progress** | ~4h | 1, 2, 3 |
| 6 | [Reset](phase-06-reset.md) | pending | ~4h | 5 |
| 7 | [Connect sheet](phase-07-connect-sheet.md) | pending | ~3h | 5 |

Phase 1 shipped its code in `833d91f` but **not one of its criteria has been checked**: every one is
a question about a database, and `supabase/schema.sql` has never been run for `project_secrets`. It
has never held a row. Phase 5 is where that finally becomes true, and it applies `saved_queries` at
the same time — the SQL editor left that table in the identical state. Note the shape of that
dependency: phase 1 is *verified inside* phase 5 rather than before it.

Phase 2 landed in `5990cc8`. Phase 3 is independent of both and can go first.

**Applying `supabase/schema.sql` is a manual deploy against a live database, not a step in a UI
phase.** `260911-0910-project-drag-ordering` adds `project_order` to the same file; two plans both
saying "run the file" is a race, and whoever runs it second needs to know what the first one changed.

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
- ~~**The password appears in plain text**~~ — **reversed 2026-09-15.** The original text closed with
  "masked-by-default with a reveal toggle is a one-line change if it turns out to matter." It turned
  out to matter. The string on screen stays `[YOUR-PASSWORD]`; a second Copy button, shown only when
  the vault is unlocked *and* this project has a password stored, puts the real one on the clipboard.
  The reasoning that a masked connection string is not a connection string still holds — which is why
  the answer is a clipboard, not a mask.

## What the 2026-09-15 research settled

Both reports were corrected against the spec after they were written; read the corrections, not just
the summaries.

**[Password constraints](../reports/260915-1340-database-password-constraints-research.md)**

- `minLength: 4`, no `maxLength`, no `pattern`. **The API will accept `aaaa`** as the password of an
  internet-reachable database. Whatever this app enforces must be stricter than the API, and the
  comment should say why: a rule that merely matches upstream is a restatement of someone else's
  mistake, not validation.
- **Generate from an alphanumeric alphabet**, as Supabase's own dashboard does. 16 characters over 62
  is ~95 bits, and it sidesteps the URI hazard entirely rather than relying on encoding to rescue it.
  Rejection sampling, because 62 does not divide 256.
- `encodeURIComponent` at substitution time is still required — a *typed* password can contain
  anything, and `#` is the cruel one: it opens a URI fragment, so the connection fails with a password
  that looks right on screen.
- **The blast radius is narrower than assumed.** Supabase's own services update themselves; the
  poolers carry the old password for a few seconds; what actually breaks is external applications
  holding a direct connection string. The confirm must say that and not more — overstating it teaches
  people to click through warnings.

**[Settings UI](../reports/260915-1610-supabase-settings-ui-research.md)**

- Restart and pause both have endpoints, so "Project availability" is a future phase rather than a
  greyed row.
- `integrations/tpa` **does not exist** — but `config/auth/third-party-auth` does, so the honest
  reason to leave Integrations out is that nothing in this app consumes third-party auth config, not
  that the API is missing. The row stays out; the reason on record has to be the true one, because it
  is the reason the next person will reuse.
- Billing, Usage and Team are organization-scoped. This app reads an organization's name
  (`lib/inventory.ts:42-50`) but has no membership or billing model, so those rows are omitted rather
  than greyed.

## Cross-plan notes

**[260911-0910-project-drag-ordering](../260911-0910-project-drag-ordering/plan.md)** adds
`project_order` to `supabase/schema.sql`; phase 1 here adds `project_secrets` to the same file.
Different tables, no conflict — but whichever lands second means one more run of the file.

**[260910-0042-navigation-latency](../260910-0042-navigation-latency/plan.md)** phase 6 touches
`lib/inventory.ts` — and so does **phase 4 here**, now that renaming a project has to invalidate the
`owners` memo. The earlier claim of "no overlap" was written before the rename existed and is wrong.
Whichever lands second rebases onto the other.

## Success metrics

- The `settings` slug is live, and every greyed row in the sub-nav names a real endpoint.
- A project can be renamed, and the new name appears without a reload.
- Vault unlocked with a password saved: the second Copy button appears and puts a working connection
  string on the clipboard for direct, transaction pooler and session pooler.
- Vault locked, or nothing stored: that button is absent, and all three strings show the placeholder
  exactly as today.
- A reset is confirmed by typing the project name, appears in the connection event log, and the
  password never reaches the audit detail.
- Save, lock, unlock, reopen the sheet — the same password comes back.
- A blob that cannot be decrypted blocks saving instead of overwriting it.
- **The server never receives plaintext on the store and substitute paths** — verified by inspecting
  the request payload, not by reading the code. **The reset `PATCH` in phase 6 is the one deliberate
  exception**: Supabase is the party setting the password, so its payload is expected to contain it,
  and phase 6 documents that at the action. Stating the rule without its exception would teach the
  next reader that the rule is unreliable and stop them checking it where it does hold.
- The connection credentials form behaves identically after phase 2.
- `pnpm test` (**396** today), `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green. The suite is
  `lib/**/*.test.ts` with no DOM harness, so every UI criterion in phases 3-7 is a manual check.
