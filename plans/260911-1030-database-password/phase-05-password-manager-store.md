---
phase: 5
title: "Password Manager: store"
status: in-progress  # code done; the schema is a manual deploy and has not run
priority: P1
effort: "4h"
dependencies: [1, 2, 3]
---

# Phase 5: Password Manager: store

## Overview

`/p/[ref]/settings/passwords` — the page that finally calls `lib/project-secrets.ts`, written in
September and never imported by anything.

Storing only. The reset button is phase 5, and keeping them apart means the dangerous half lands on
top of a page that already works.

## Requirements

**Functional**
- Type a database password, save it encrypted, come back after a reload and it is still there.
- The five states below are each distinguishable on screen.
- `supabase/schema.sql` is applied, for `project_secrets` **and** `saved_queries`.

**Non-functional**
- The server never receives plaintext. Encryption happens in the browser, as everywhere else in the
  vault.
- No second copy of the crypto cycle: `components/use-vault-secret.ts` from phase 2 is the only one.

## Apply the schema first, and mean it

Phase 1's criteria are all database questions and **not one of them has ever been checked**, because
`supabase/schema.sql` has never been run for this table. `project_secrets` has never held a row.
`saved_queries` — from the SQL editor plan — is in exactly the same state. Both are applied here,
together, and phase 1's criteria are checked for real:

- The file run twice is a no-op the second time.
- Under impersonation a row writes and reads back.
- A second user can read neither.
- Saving twice replaces rather than duplicating.
- The action refuses a malformed ref and an oversized blob.
- The blob is stored byte-identical.

**The 8,000-character cap is not a cap.** `MAX_BLOB` lives in `lib/project-secrets.ts:21` and
nowhere else; `project_secrets.vault_blob` carries no check constraint. Twenty lines away in the same
schema file, `saved_queries` has `saved_queries_name_len` and `saved_queries_sql_len` with the reason
written next to them:

> The length checks live here rather than only in the action. The browser holds a session and the
> anon key, so an insert can reach this table without passing through the app's own code — a cap that
> only exists in TypeScript is not a cap.

`revoke all from anon` does not help: a signed-in browser reaches PostgREST as `authenticated`, which
is the role the policy admits. Add `project_secrets_blob_len`, and follow the same
`drop constraint if exists` / `add constraint` pair the saved-queries block uses.

**`create table if not exists` never converges constraints** — a lesson this repo has already paid
for. If the table exists from an earlier partial run, check the constraints rather than assuming the
file brought them.

## The five states, and why the fifth one matters most

| State | Renders |
|---|---|
| No vault yet | `VaultGate` — create a master password |
| Vault locked | `VaultGate` — unlock |
| Unlocked, nothing stored | Empty field, Save disabled until something is typed |
| Unlocked, stored | `●●●●` with a reveal toggle, Save |
| **`decryptFailed`** | **Save blocked, and the reason stated** |

The last one is the entire reason `useVaultSecret` carries that flag. A failed decrypt leaves the
value empty, which looks exactly like "nothing stored" — and saving from there writes a null blob
**over the real one**. For a database password that is unrecoverable: Supabase will not return it,
only replace it. The comment on that flag says the broken version is the one that looks correct.

## Architecture

**Server component reads, client component decrypts** — the same shape as
`components/connection-credentials.tsx`. The page calls `projectSecret(ref)` and passes the
ciphertext down as a prop. It is opaque, so this exposes nothing, which is the reasoning that already
lets `connection_secrets` blobs reach the credentials form.

No new part and no client fetching. Nothing on this page is a slow fan-out, and the CSR plan's rule
was about pages that wait on the Management API — this one waits on a single row in this app's own
database.

**Blob shape `{ db_password: string }`.** An object rather than a bare string so phase 5 and anything
later can add a field without a migration of the ciphertext.

**`saveProjectSecret` is not callable from a client component, and the first draft of this phase
assumed it was.** `lib/project-secrets.ts:1` is `import "server-only"` and deliberately not a
`"use server"` module — its own comment at `:12-15` explains why: every export of one becomes an
action the browser can call. So this phase creates a `"use server"` wrapper beside the twelve action
modules that already exist. The comment at `lib/project-secrets.ts:14` says *"The action wrapper lives
in the page beside its neighbours"*, which cannot be true — a `"use server"` file may only export
async functions — and is the sentence that caused the mistake. Fix it there too.

**`undefined` and `null` do not mean the same thing here.** `connection-credentials.tsx:74` passes
`await seal(kept)` straight through, and `saveConnectionSecret` treats `undefined` as *leave the
stored blob alone* — `lib/vault-actions.ts:59-70` goes to some length about why. `saveProjectSecret`
has no such affordance: `undefined` falls through to its type check and throws `"Invalid credential"`.
Decide which it is here — give `saveProjectSecret` the same optional-blob meaning, or guard at the
call site — and write it down, because phase 6 depends on the answer when the key expires mid-flow.

**There is a window where the guard says everything is fine and a save still destroys the blob.**
Between mount and `decryptJson` resolving (`components/use-vault-secret.ts:26-46`), `value` is `{}`
and `decryptFailed` is `false`. `seal({})` returns `null`, and `saveProjectSecret(ref, null)` deletes
the row. Narrow, and exactly the unrecoverable outcome the guard exists to prevent — so Save stays
disabled until the blob has actually decrypted or is known to be absent.

**Say what cannot be checked.** The app cannot tell a correct password from a typo — the API never
returns one. One line under the field. **Do not build a test-connection feature to compensate**; that
was settled in the original plan and nothing since has changed it.

## The rotation path does not know this table exists

`rotateVault` (`lib/vault-actions.ts:37-50`) takes `{ connection_id, vault_blob }[]`, re-writes only
`connection_secrets`, and updates the `vault` row's salt and check blob in the same call — so the old
key stops existing. **Every blob in any other table is orphaned permanently.**

It has no caller yet; there is no change-master-password UI. But it is already exported from a
`"use server"` module, so the day that UI is built, `project_secrets.vault_blob` becomes noise.
`decryptFailed` would then correctly block saving — and the database password would be gone, leaving
only the most dangerous operation in the app as the way back.

Either extend `rotateVault` to take project blobs as well (one more loop), or, if that is deliberately
deferred, put a comment at `lib/vault-actions.ts:37` naming `project_secrets` as a table it does
**not** cover and what that costs. Deferring silently is the one option that is not available.

## Related Code Files

- Create: `app/(app)/p/[ref]/settings/passwords/page.tsx`,
  `components/project-settings/password-manager.tsx`,
  **`lib/project-secret-actions.ts`** — see below
- Modify: `lib/project-secrets.ts` — correct the stale comment at `:14`
- Modify: `supabase/schema.sql` — apply it, **and add the length constraint below**
- Read for context: `lib/project-secrets.ts` (phase 1), `components/use-vault-secret.ts` (phase 2),
  `components/connection-credentials.tsx` for the field and gate shape

## Implementation Steps

1. Apply `supabase/schema.sql`. Check phase 1's six criteria against the real database and record the
   answers in that phase file.
2. The route, reading `projectSecret(ref)` in a server component.
3. The client component: `VaultGate`, the field, the reveal toggle, Save through
   `saveProjectSecret`.
4. Wire `decryptFailed` to block Save, and say why on screen.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
6. By hand: save, reload, lock, unlock, reopen.

## What landed

- `lib/project-secret-actions.ts` — the `"use server"` half, because `lib/project-secrets.ts` is
  `server-only` by design and a client component cannot call it. **Storing and clearing are two
  functions**, so the difference between "save this", "leave it alone" and "delete it" can never
  depend on a value happening to be `undefined` — which is precisely what `seal()` returns when the
  vault has locked.
- `lib/project-secrets.ts` — `listProjectSecrets`, and the comment at `:14` corrected: it claimed the
  action wrapper could live in a page, which a `"use server"` file cannot do.
- `lib/vault-actions.ts` — `rotateVault` now takes project blobs as a **required** third argument.
  It replaces the vault's salt in the same call that re-encrypts, so the old key stops existing when
  it returns; anything it skipped is unreadable for good. It took connection blobs only, which meant
  the first change-master-password screen anyone built would have destroyed every stored database
  password. Required rather than defaulted, so forgetting the next table fails the build.
- `supabase/schema.sql` — `project_secrets_blob_len`. `MAX_BLOB` lived only in TypeScript, and the
  `saved_queries` block twenty lines below already explains why that is not a cap: a signed-in
  browser reaches PostgREST as `authenticated`, which is the role the policy admits, without passing
  through this app's code at all.
- `components/project-settings/password-manager.tsx` and its route.

**The decrypt window is handled at the call site, not in the hook.** Between mount and the decrypt
resolving, `value` is `{}` and `decryptFailed` is false — so `seal({})` returns null and a save would
delete the row while every guard reports health. `decryptFailed` cannot cover it, because the blob
decrypts perfectly; it just has not finished. Save is blocked while a blob exists and no value has
arrived.

/p/[ref]/settings/passwords first load: 646,909 bytes.

## NOT DONE: the schema has not been applied

`supabase/schema.sql` still has not run. The app's own database lives in a Supabase project that
`SB_TOKEN` cannot reach — checked — and there is no `psql` or service-role key on this machine, so
this is the manual deploy the plan said it was.

**Until it runs, this page cannot store anything**, `project_secrets` still has no rows, and phase 1's
six criteria remain unchecked. `saved_queries` is in the same state and is applied by the same run.

## Success Criteria

- [ ] **Blocked on the schema.** `supabase/schema.sql` applied; phase 1's criteria checked and
      recorded there.
- [ ] **Blocked on the schema.** A saved password survives a reload and a lock/unlock cycle.
- [ ] **Needs the app.** A blob that cannot be decrypted blocks saving rather than overwriting it.
- [ ] **Needs the app.** Each of the five states is reachable and distinguishable.
- [ ] **Needs the app.** The server never receives plaintext — verified by inspecting the request
      payload in the network tab, not by reading the code.
- [x] The page says the password cannot be validated, and no test-connection feature was built.
- [x] The blob length cap exists in the database, not only in TypeScript — written into the schema,
      pending the same deploy.
- [x] `rotateVault` covers `project_secrets`, and its signature makes the next omission a build
      failure rather than a silent loss.
- [x] Save is impossible during the decrypt window, not merely unlikely.
- [x] `pnpm test` still green — 396. `lib` only, no DOM harness, so every component row above is a
      manual check rather than coverage.

## Risk Assessment

**Two writers, no concurrency control.** `lib/project-secrets.ts:46-49` upserts unconditionally and
`updated_at` is written but never compared; `useVaultSecret` decrypts once into React state and never
re-reads. Two tabs, or this page's Save sitting beside phase 6's Reset, are last-write-wins over the
only copy of a password. Either compare `updated_at` on write or state plainly that two tabs are not
supported — but do not leave it undecided, and do not let phase 6's Reset leave a stale value in a
field whose Save button is still live.

**Overwriting a real blob with null.** The failure `decryptFailed` exists to prevent, and the one
with no undo. Everything else on this page is recoverable by typing again.

**A half-applied schema.** `create table if not exists` will happily leave a table without the
constraints the file declares, and the second run will not fix it.

**Implying validation.** A field that looks like every other validated field invites the assumption
that a typo would have been caught. It would not.
