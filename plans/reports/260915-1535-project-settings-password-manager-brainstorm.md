# Project Settings, and a Password Manager inside it

Brainstorm, 2026-09-15. Started from "I remember building database-password storage once — where is it?"

## What was already there, and why nobody could find it

`833d91f` (2026-09-11) shipped **storage only**: `lib/project-secrets.ts` (51 lines) and the
`project_secrets` table in `supabase/schema.sql`. No UI, and **no file in the repo imports it** —
grep confirms zero callers. The table is keyed `(user_id, project_ref)`, RLS on, `revoke all from
anon`. It has never held a row.

The vault around it is live and does work, just for *connections* rather than projects:

| | State |
|---|---|
| `lib/vault-crypto.ts`, `lib/vault-store.ts` | Working — non-extractable `CryptoKey` in IndexedDB, expires after 8h |
| `components/vault-provider.tsx` | Mounted at `app/(app)/layout.tsx:18`, so it already wraps every `/p/[ref]` page |
| `components/use-vault-secret.ts`, `components/vault-gate.tsx` | Working |
| `components/connection-credentials.tsx` | Working — the shape to copy |
| `project_secrets` + `lib/project-secrets.ts` | Table and functions, no UI |

## Three measured facts that changed the design

Read from the Management API's own OpenAPI spec (`https://api.supabase.com/api/v1-json`), not from
memory:

1. **`PATCH /v1/projects/{ref}/database/password`** exists — body `{password}`, required, responses
   200/401/403/429/500. So this page can *set* the password, not only remember one.
2. **`PATCH /v1/projects/{ref}`** takes `{name}`. General settings is therefore buildable, not a
   greyed row. The original instinct was to disable every settings page except the password one; that
   would have greyed the first thing anyone opens Settings to find, while the API supports it — the
   opposite of the rule `components/project-nav.tsx:22` already set for itself when it refused to list
   Integrations.
3. **Supabase shows the database password exactly once, at project creation.** So "type the password
   you already have" is, for most people, an empty box they cannot fill. A Password Manager that can
   only store would send the user to Supabase's own dashboard to reset, then back to paste. Store and
   reset belong together.

## Decisions

| Question | Chosen | Rejected |
|---|---|---|
| What the page does | Store **and** reset, reset behind a type-the-project-name confirm | Store only (empty box nobody can fill); reset only (leaves `project_secrets` and the vault unused) |
| General settings | Build it — name editable, ID and region read-only with Copy | Read-only; disabled |
| Connection string | A second Copy button, shown only when the vault is unlocked *and* a password is stored | Auto-fill (puts the secret on screen — Supabase deliberately does not); no link at all (removes the reason storing it has value) |

Naming note, recorded because it is a deliberate deviation: Supabase keeps the database password under
**Settings → Database**; there is no "Password Manager" anywhere in its dashboard. A separate page is
off-standard, and justified only because this app does something Supabase does not — it *keeps* the
password, encrypted, rather than showing it once and forgetting.

## Design

### Routes

```
/p/[ref]/settings            General settings
/p/[ref]/settings/passwords  Password Manager
```

A second-level nav on the left, as Supabase has. `ready: true` on the `settings` slug in
`components/project-nav.tsx:51`.

Greyed entries in that sub-nav — Database, API, Auth, Storage — each have a real endpoint behind them
(`config/database/postgres`, `postgrest`, `config/auth`, `config/storage`), so they are a roadmap and
meet the bar the main nav set for itself.

### Password Manager

Server component reads `projectSecret(ref)` and hands the blob to a client component — the same shape
as `connection-credentials.tsx`. No new part, no client fetching: nothing on this page is a slow
fan-out.

Five states:

| State | Renders |
|---|---|
| No vault yet | `VaultGate` — create a master password |
| Vault locked | `VaultGate` — unlock |
| Unlocked, nothing stored | Empty field + "Generate new password" |
| Unlocked, stored | `●●●●` + Reveal + Save + Generate |
| **`decryptFailed`** | **Save blocked entirely** |

The last one is why `useVaultSecret` has that flag: a failed decrypt leaves the value empty, which is
indistinguishable from nothing stored, and saving from there writes a null blob over the real one.
For a database password that is unrecoverable — Supabase will not return it, only replace it.

### Reset, and why the order cannot be swapped

```
1. Generate client-side (crypto.getRandomValues)
2. Confirm — names the project first, states the consequence, types the project name
3. PATCH /v1/projects/{ref}/database/password
4. Encrypt with the vault key, write to project_secrets
5. recordWrite({ ref, what: "database password", outcome: "reset" })
```

**PATCH first, store second.** Storing first and failing the PATCH leaves the vault holding a password
that was never set, with the real one already overwritten. The other way round, a failed step 4 means
a real new password nobody holds — so that failure must **show the password once**, say plainly that
it is the only time, and offer to retry the save.

`recordWrite` is also what calls `dropProject`, so the project's read cache goes with it.

**One deliberate exception to the vault's rule, and it must be commented as such:** the PATCH requires
the plaintext password to pass through this server on its way to Supabase. Everywhere else the server
holds only ciphertext it cannot read. The action receives it, forwards it, stores nothing, and the
password must never reach the audit `outcome`.

### Connect sheet

A second button beside Copy in `components/connect-sheet.tsx:105`, rendered only when the vault is
unlocked and this project has a stored password. The string on screen stays `[YOUR-PASSWORD]`; only
the clipboard gets the real one, and only on a deliberate click.

### General settings

The `identity` part already returns `name`, `ref`, `region` — no new reader. Name is editable through
`PATCH /v1/projects/{ref}`; ID and region are read-only with Copy buttons, as in the reference
screenshot.

## Risks

- **Losing the password is unrecoverable, and this is the most dangerous feature in the app so far** —
  more so than `drop table`, which at least has backups. After a PATCH the old password does not exist
  anywhere.
- **A reset breaks everything currently connected**, not just this app: every service of the user's
  using that password. The confirm has to say that sentence, not "are you sure?".
- **`project_secrets` has never run in production.** It is in `supabase/schema.sql` but no row has ever
  been written. The schema needs re-running — together with `saved_queries`, which is in the same
  state from the SQL editor work.
- **The plaintext hop.** One server action sees a password in the clear. It is the only one, and that
  is worth a comment that survives future refactors.

## Success criteria

- The `settings` slug is live; the sub-nav's greyed entries each name a real endpoint.
- Project name can be renamed and the change is visible without a reload.
- A stored password survives a reload, decrypts only in the browser, and a failed decrypt cannot
  overwrite it.
- A reset is confirmed by typing the project name, appears in the connection event log, and never puts
  the password in the audit detail.
- The connection string never shows a real password on screen; the second Copy button appears only
  when the vault is unlocked and a password is stored.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` stay green — 396 tests today.

## Next

Large enough and dangerous enough to be planned in phases rather than cooked straight through.
