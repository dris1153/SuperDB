---
phase: 6
title: "Reset"
status: pending
priority: P1
effort: "4h"
dependencies: [5]
---

# Phase 5: Reset

# THE DANGEROUS PHASE

Read this section before writing anything.

**A reset cannot be undone, and there is no backup of the thing it destroys.** `drop table` is
recoverable from a point-in-time backup; the previous database password is not stored anywhere, by
anyone, once `PATCH` returns 200. If the new one is not captured, the only remedy is another reset.

This is the most dangerous operation in the app. It is worth building because the alternative is
worse: **Supabase shows the database password exactly once, at project creation**, so a page that can
only store one leaves most people staring at a box they cannot fill, and sends them to another
dashboard to do the dangerous thing there instead — unaudited, and without saving the result.

## Overview

A generated password, a confirm that states what actually breaks, the `PATCH`, and the store.

## Requirements

**Functional**
- Generate a password in the browser and reset the project's database password to it.
- Confirm first, in the `write-confirm.tsx` shape: the project is named, and the user types its name.
- On success the new password is stored in the vault and the event is audited.
- If the store fails after a successful `PATCH`, the password is shown once with that fact stated
  plainly, and the save can be retried.

**Non-functional**
- The generated password cannot corrupt a connection URI.
- The password never reaches the audit detail, a log line, or an error message.

## Never overwrite the stored password before a 200 — which is not the same as never writing

The first draft of this phase said "PATCH first, store second" and defined exactly one failure: the
PATCH succeeds and the store fails. A red-team pass found that the rule protects the right thing and
draws the wrong conclusion, because **an indefinite PATCH is indistinguishable from one that was
never sent, and Supabase may have committed anyway.** `call()` in `lib/mgmt-api.ts:55` passes no
`AbortSignal`, so the only timeout is the platform's. On that path the old password may already be
dead, the new one is held by nobody, and the draft had the client report "reset failed" and throw
away the string it had just generated.

Phase 5 chose an object blob *"so phase 6 and anything later can add a field without a migration"*.
This is that field:

```
1. Generate in the browser (crypto.getRandomValues)
2. Confirm — names the project, states the blast radius, types the project name
3. Store { db_password: <current>, pending_password: <new> }   <- db_password untouched
4. PATCH /v1/projects/{ref}/database/password
5. 200        -> collapse to { db_password: <new> }, drop pending_password
   anything else, including no answer at all
              -> pending_password stays on disk, and the page says so:
                 "A reset was sent at <time>. If the old password no longer works, this is the one
                  that was sent." — with a Copy, and a way to confirm or discard it.
```

The invariant is **`db_password` is never overwritten before a 200**. Writing *more* before the PATCH
is what turns the unrecoverable state into a recoverable one, and the original rule forbade it by
accident.

A browser closed between 3 and 4 now leaves the string on disk rather than nowhere. Two tabs are
covered by the same field — see the concurrency note in phase 5.

## Audit every exit, not only the good one

`lib/write-audit.ts:8-13` states the contract this phase has to meet:

> Every attempt lands in `connection_events` — including the ones that failed. A write that errored
> still matters: a request can time out at the HTTP layer after the server has committed, and without
> a record nothing in the system knows it was ever tried.

The first draft put `recordWrite` last, on the success path only — so the one case where the audit is
the sole surviving evidence, the timeout, wrote nothing. Call it at **every** exit:

| Exit | `outcome` |
|---|---|
| Before the PATCH | `attempted` |
| 200 and stored | `reset` |
| 200, store failed | `reset, not stored` |
| Timeout or no answer | `outcome unknown` |
| Refused upstream | `refused: <reason>` |

## Generating a password that cannot break a URI

Measured, and recorded in
[the constraints research](../reports/260915-1340-database-password-constraints-research.md):

- **The API's own floor is `minLength: 4`** — read from the OpenAPI schema. It will accept `aaaa` as
  the password of an internet-reachable database. **What this app enforces must be stricter**, and
  the comment should say why: a rule that merely matches upstream is a restatement of someone else's
  mistake, not validation.
- **Alphanumeric, as Supabase's own generator does.** 16 characters over 62 is about 95 bits, and it
  removes the URI hazard at the source instead of relying on encoding to rescue it.
- **Rejection sampling.** 62 does not divide 256, so mapping raw bytes with `%` biases the alphabet.
  Draw again rather than fold.
- **`encodeURIComponent` is still required at substitution time** (phase 6), because a *typed*
  password can contain anything. `#` is the cruel one: it opens a URI fragment, so the connection
  fails while the password looks correct on screen.

## What the confirm must say, and must not

The research narrowed the blast radius, and the confirm has to be accurate in both directions —
overstating it teaches people to click through warnings:

- Supabase's own services (PostgREST, realtime, storage) pick up the change themselves.
- The poolers carry the old password for a few seconds before catching up.
- **What actually breaks is anything outside this app holding a direct connection string** — the
  user's own applications, CI, a `psql` alias.
- API keys, the service-role key and Studio access are **not** affected.

Say those four things. Not "are you sure?".

## Refuse before the PATCH, not after

**The vault must be unlocked when the action is called, and that is a precondition rather than a
check.** The key expires after 8 hours (`lib/vault-store.ts:13`) and can expire between the page
opening and the confirm being clicked. If it does, `seal()` returns `undefined`
(`components/use-vault-secret.ts:55-59`) — and `saveProjectSecret(ref, blob)` has no "leave it alone"
meaning for `undefined` the way `saveConnectionSecret` does; it throws `"Invalid credential"`. A
password that was successfully set would then be reported as a validation error. Refuse the reset
while locked; do not discover it after Supabase has committed.

**The minimum length is enforced in the action, not in the generator.** `lib/project-actions.ts` is a
`"use server"` module, so every export is an endpoint any signed-in browser can call with any string.
A rule that lives only in `lib/password-generate.ts` is a UI convenience, not a boundary. The API's
own floor is `minLength: 4`; this app's floor is checked server-side before the value is forwarded.

**Refuse on a paused or restoring project.** `app/(app)/p/[ref]/page.tsx:31` already branches on
`isPaused`/`isMoving`; this route is its sibling and will happily render without it. The spec
documents no 400 for that case, so the behaviour is unknown — mirror the overview's branch rather
than find out on a real project.

**One reset at a time.** Each reset restarts the propagation window, and pressing the button again is
the natural response to "it didn't work" — which kills the first new password before the poolers have
caught up. Disable it for the propagation window and say why.

## The one place plaintext crosses the server

Everywhere else in this vault, the server holds ciphertext it cannot read. **The `PATCH` requires the
password in the clear**, because Supabase is the one setting it.

**Where it is safe today, and why — measured, so a later refactor has something to run into:**

- `lib/mgmt-api.ts:72` throws a message built from the URL path and the *upstream response body*. The
  request body — the only place the password appears — is never interpolated. Safe **by structure**,
  not by intent.
- `SUPERDB_TIMING=1` (`lib/mgmt-api.ts:62`) logs milliseconds, status and path. Never a body.
- `app/(app)/p/[ref]/error.tsx:16` deliberately does not render `error.message`.
- There is no `middleware.ts` and no `instrumentation.ts` in this repo, so there is no
  `onRequestError` and no proxy-layer body logging. **Adding either re-opens this question.**

**Unknown, and the phase must measure it rather than assume:** the spec declares responses
`200/401/403/429/500` and **no 400 at all**, so the shape of a validation error is undocumented. Send
a 3-character password to a throwaway project and record the body verbatim. If Supabase echoes the
value, `describe()` in `lib/safe.ts:56-62` parses the first brace out of that message and puts
`body.message` straight on screen.

**Why this matters more than it looks:** `connection_events` is append-only by policy —
`lib/sql-redact.ts:4` records that it has `select` and `insert` and nothing else, *"with no way to
delete the row"* — and `app/(app)/settings/page.tsx:50` renders `detail` verbatim to the user. A
password that lands there can never be removed. `lib/sql-redact.ts` is the precedent for this rule;
cite it rather than re-deriving it.

## Architecture

`lib/project-actions.ts` gains the reset action beside `resumeProject`. The client generates,
confirms, calls the action, then encrypts and stores through the same path phase 4 uses — the server
never sees the ciphertext step at all.

`recordWrite` is the audit, and it also drops the project's read cache. `what: "database password"`,
`outcome: "reset"` — its `schema`/`table` pair is optional precisely so a non-table write can use it.

## Related Code Files

- Create: `lib/password-generate.ts` + its test — the alphabet, the rejection sampling, the length
- Modify: `lib/project-actions.ts` — the reset action
- Modify: `components/project-settings/password-manager.tsx` — the button, the confirm, the
  show-once path
- Read for context: `components/table-editor/write-confirm.tsx` for the confirm shape,
  `lib/write-audit.ts`, `lib/sql-redact.ts` for the append-only audit precedent

**`write-confirm.tsx` cannot be reused directly** — checked, not assumed. Its type-to-confirm is
`useGuardedSchema` (`components/table-editor/guarded-schema.tsx:29`), which matches a **table** name
and only engages for the `auth`/`storage` schemas; the component also requires `schema`, `table` and
`affected`, and disables its confirm button while `affected == null` (`write-confirm.tsx:144`). This
is a **new dialog in the same shape**. Decide explicitly whether the type-the-name rule is generalised
out of `guarded-schema.tsx` or duplicated, and say which.

## Implementation Steps

1. Measure the undocumented failure: send a 3-character password to a throwaway project, record the
   response body verbatim, and decide from that whether `describe()` can surface it.
2. `lib/password-generate.ts` as a pure module with tests: alphabet is alphanumeric, length is right,
   no modulo bias, output differs across calls.
3. The reset action — locked-vault refusal, paused-project refusal, server-side minimum, and the
   plaintext comment naming the four safe-by-structure sites above.
4. The confirm: a new dialog in the `write-confirm.tsx` shape, with the four true statements.
5. `pending_password` written before the PATCH, collapsed on 200, surfaced on anything else.
6. `recordWrite` at every exit.
7. The page's state after a reset: the field reloads from the new blob and Save is disabled until the
   user edits it — a stale field beside a live Save button destroys the new password.
8. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. **The suite covers `lib` only and has no
   DOM harness**, so `password-generate` is the only part of this phase it can reach; everything else
   is checked by hand.
9. By hand, on a project that matters to nobody.

## Success Criteria

- [ ] A reset requires typing the project name.
- [ ] The confirm states the four true consequences and does not overstate them.
- [ ] A successful reset stores the new password and the next Copy produces a working string.
- [ ] `db_password` is never overwritten before a 200, and a reset interrupted between the store and
      the PATCH leaves `pending_password` recoverable on the next load.
- [ ] **A failed reset still leaves an audit row** — timeout included.
- [ ] The action refuses while the vault is locked, and on a paused or restoring project.
- [ ] After a reset the field holds the new password, and Save cannot destroy it.
- [ ] The password appears in no audit row, log line or error message — checked by reading the
      `connection_events` row afterwards, not by reading the code.
- [ ] The generator is alphanumeric, ≥ 16 characters, unbiased, and tested.
- [ ] The app's own minimum is stricter than the API's `minLength: 4`, **enforced in the action** —
      verified by calling it with a 4-character string and getting a refusal.
- [ ] The undocumented 400 body was measured and recorded, not assumed.
- [ ] `pnpm test` still green.

## Risk Assessment

**The user loses their database password.** Steps 3–5 in that order, and the show-once screen, are
the whole mitigation. There is no other.

**A generated password that corrupts a connection string.** Removed at the source by the alphabet
rather than patched at the seam.

**Plaintext leaking into the audit trail.** The audit is the one place in this app designed to be
read later, which is exactly what makes it the worst place for a password to land.

**Confirm fatigue.** If the dialog overstates the damage, the next one is clicked through. Four true
sentences beat one dramatic one.
