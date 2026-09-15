---
name: rotatevault-covers-one-table
description: rotateVault re-encrypts connection_secrets only — any second vault table is silently orphaned when the master password changes
metadata:
  type: project
---

`lib/vault-actions.ts::rotateVault(meta, blobs)` takes `{ connection_id, vault_blob }[]` and loops
`connection_secrets`. It updates the `vault` row's salt/iterations/check_blob in the same call, so
the old key stops existing. Any blob in another table stays encrypted under it forever.

`project_secrets` is exactly that second table. It has no caller today — `rotateVault` itself has no
caller in `components/` or `app/`, so there is no change-master-password UI yet — but the action is
exported from a `"use server"` module and is already reachable from any browser.

The companion trap at the same boundary: `useVaultSecret.seal()` returns `undefined` when the vault
is locked, meaning "leave the stored blob alone". `saveConnectionSecret` honours that
(`vaultBlob?: string | null`); `saveProjectSecret(ref, blob: string | null)` does not — `undefined`
throws `"Invalid credential"`, whose text is then redacted to a digest in production.

**Why:** for a Supabase database password, an orphaned blob is not an inconvenience — the value
exists nowhere else and the only remedy is `PATCH /v1/projects/{ref}/database/password`, the most
destructive call in the app. `decryptFailed` correctly refuses to save over it, which makes the loss
look like a guard working.

**How to apply:** any review that adds a table holding a `vault_blob`, or a new `seal()` call site,
must say what happens on rotation and what `undefined` means at that call site. See
[[action-error-text-redacted]].
