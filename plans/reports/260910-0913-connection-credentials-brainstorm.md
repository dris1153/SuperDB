---
type: brainstorm-report
date: 2026-09-10
scope: connection credentials — persistence bug and credential visibility
branch: perf/navigation-latency
head: 6f03ce1
---

# Connection credentials — why a saved credential comes back empty

## Problem statement

Reported: after saving a credential with method "Email + password", reopening the connection shows no
account and asks for the master password again. Wanted alongside the fix: a more visible way to see
which connections have credentials, including a badge on the connections table row.

Confirmed with the user: **the form is empty even after unlocking with the correct master password.**
That single answer eliminated the first hypothesis and pointed at the real cause.

## Diagnosis

### Root cause — no cache invalidation after saving

`lib/vault-actions.ts::saveConnectionSecret` calls no `revalidatePath`, and
`components/connection-credentials.tsx::save` calls no `router.refresh()`.

The contrast is one file away: the Details tab of the same dialog does call `router.refresh()`
(`components/edit-connection.tsx:51`). Only the credentials branch omits it.

```
save credential  → row written (upsert is correct, RLS is correct)
                 → nothing invalidated
connections/page.tsx  → server component never re-runs
                 → the `secrets` array in the RSC payload stays stale
reopen dialog    → EditConnection receives secret={null}
                 → useState(secret?.supabase_email ?? "")  →  ""
                 → the decrypt effect early-returns on !secret?.vault_blob
```

So the vault key is fine and the row is in the database. The UI is reading a stale server render.
This also explains why unlocking changes nothing: unlocking supplies a key, but there is no
`vault_blob` in the stale prop to decrypt.

### Compounding bug — the empty form can destroy the stored passwords

`save()` builds `vaultBlob` as `Object.keys(kept).length > 0 ? encryptJson(...) : null` and the upsert
writes that value unconditionally. Two paths reach it with `kept` empty while a real blob exists in
the database:

1. **Stale `secret`** (the bug above). The user sees an empty form, fills in only the email, saves —
   and `vault_blob` is overwritten with `null`.
2. **Failed decryption.** `catch { setStatus("…could not be decrypted…") }` leaves `passwords` as
   `{}`. The form cannot tell "no password stored" from "password stored but unreadable", and saving
   in that state wipes it.

There is no backup and no recovery. The two bugs multiply: the first is what puts a user in front of
an empty form, and the second is what happens if they save from it.

### Separate, smaller issue — the gate hides plaintext

`ConnectionCredentials` wraps the whole form in `VaultGate`, so a locked vault hides
`supabase_login_method` and `supabase_email` too. Both are deliberately plaintext —
`supabase/schema.sql` says so directly: *"Identity stays readable: it is what answers 'whose account
is this org', and it is not a secret."* Only the passwords need the key.

Not the reported symptom, but it is why a locked vault also shows nothing, and it is the reason the
connections table has no way to answer "which account is this".

## Approaches evaluated

### Invalidation: server action vs client refresh

| | `revalidatePath` in the action | `router.refresh()` in the component |
|---|---|---|
| Correct for every caller | yes | only the caller that adds it |
| Matches existing code | `connections/page.tsx` uses it | `edit-connection.tsx:51` uses it |
| Where the knowledge lives | with the mutation | with one UI |

**Chosen: `revalidatePath("/connections")` inside `saveConnectionSecret`.** The action performs the
mutation, so it should own the invalidation; a second caller added later cannot forget it.

### Preserving the blob when saving identity from a locked vault

Moving the gate means identity can be saved while the vault is locked, and that save must not clear
`vault_blob`. Three ways:

1. **Omit `vault_blob` from the upsert payload** and rely on PostgREST's `ON CONFLICT DO UPDATE`
   setting only the columns present. **Rejected — unverified.** The local docstring in
   `@supabase/postgrest-js/src/PostgrestQueryBuilder.ts` (around line 1176) says `defaultToNull`
   "only applies when inserting new rows, not when merging" but also "only applies when doing bulk
   upserts", which does not settle the single-object case. This is exactly the class of assumption
   that produced a wrong diagnosis earlier in this session; see
   [`docs/journals/260910-misreading-a-branch.md`](../../docs/journals/260910-misreading-a-branch.md).
2. **Read-modify-write.** Fetch the blob, resend it unchanged. Rejected: introduces a lost-update
   race for no benefit.
3. **`.update()` the identity columns, insert only if no row matched.** Chosen. An `UPDATE` touches
   exactly the columns named, with no reliance on merge semantics. The insert branch runs only for a
   connection that has never had a secret, where `vault_blob: null` is the correct value anyway.

Costs one extra round trip in the rare insert branch. Worth it to remove a guess.

## Recommended solution

Four changes, in dependency order.

**1. Invalidate after saving.** `revalidatePath("/connections")` in `saveConnectionSecret`. This
alone fixes the reported bug.

**2. Refuse to save over an unreadable blob.** Track a `decryptFailed` state in `CredentialsForm`.
When `secret.vault_blob` exists and decryption threw, block `save()` and say why. Roughly ten lines,
and it closes an unrecoverable data-loss path.

**3. Move `VaultGate` to wrap only the password fields.** Identity is readable and editable with the
vault locked, matching what the schema already treats as non-secret. Requires:
   - `save()` currently early-returns on `if (!key) return;` — it must allow an identity-only save.
   - `saveConnectionSecret` gains an identity-only path per approach 3 above.

**4. Badge on the connections row.** `secretByConnection` is already built in
`app/(app)/connections/page.tsx:44`, so this costs no query. Show method plus email — both plaintext,
so no unlock is needed to render it.

## Risks

| Risk | Mitigation |
|---|---|
| Identity-only path clears `vault_blob` | Use `UPDATE`, never an upsert with an omitted column; assert in review |
| `decryptFailed` blocks a legitimate save | Only blocks when a blob exists *and* failed to decrypt; a user with no stored password is unaffected |
| Badge leaks an email in a screenshot | It is already plaintext in the dialog and the database, and it is the user's own account. No change in exposure |
| Fix 3 lets someone edit identity without the master password | Identity is not secret by design. Anyone with the session can already read it |
| Existing blobs already destroyed by bug 2 | Cannot be recovered. Worth telling the user to re-check any connection saved before this fix |

## Success metrics

- Save a credential, reopen the dialog **without reloading the page** — method, email and passwords
  all present.
- With the vault locked, the method and email are visible; the password fields are not.
- Saving identity with the vault locked leaves `vault_blob` unchanged — verify by unlocking
  afterwards and confirming the passwords still decrypt.
- A connection whose blob cannot be decrypted refuses to save rather than clearing it.
- The connections table shows method and email for every connection that has a secret.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green.

## Next steps

1. Fix 1 alone, verified by hand — it is the reported bug and is two lines.
2. Fix 2, before anyone else meets the empty form.
3. Fixes 3 and 4 together; they touch the same two files.

## Open questions

- Whether any existing `connection_secrets` row already has a `vault_blob` cleared by bug 2. Only the
  user can tell, by unlocking each connection and checking. Worth doing before the fix ships, because
  afterwards the empty state becomes indistinguishable from a never-set one.
- Whether the badge should distinguish "identity only" from "identity plus passwords". Deferred: it
  adds a third state to the table for a distinction the dialog already shows.
