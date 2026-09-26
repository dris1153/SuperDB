"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./supabase/server";
import { METHOD_VALUES, type Method } from "./credential-methods";

export type VaultMeta = { salt: string; iterations: number; check_blob: string };

export type ConnectionSecret = {
  connection_id: string;
  supabase_login_method: Method | null;
  supabase_email: string | null;
  vault_blob: string | null;
};

export async function getVaultMeta(): Promise<VaultMeta | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("vault").select("salt, iterations, check_blob").maybeSingle();
  return (data as VaultMeta) ?? null;
}

/** Refuses to overwrite an existing vault — that would orphan every blob encrypted under the old key. */
export async function setupVault(meta: VaultMeta): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase.from("vault").select("user_id").maybeSingle();
  if (existing) throw new Error("A vault already exists for this account");

  const { error } = await supabase.from("vault").insert({ ...meta, user_id: user.id });
  if (error) throw new Error(error.message);
}

/**
 * Rotating the master password: the client re-encrypts every blob under the new key and sends them
 * back together with the new parameters. Done in one call so a half-rotated vault cannot exist.
 */
export async function rotateVault(
  meta: VaultMeta,
  blobs: { connection_id: string; vault_blob: string }[],
  /**
   * **Required, not optional, and that is the point.** This function replaces the vault's salt in the
   * same call that re-encrypts the blobs, so the old key stops existing the moment it returns — and
   * anything it did not re-encrypt is unreadable for good. It used to take connection blobs only,
   * which meant every database password in `project_secrets` would have been silently destroyed by
   * the first change-master-password screen anyone built. A required argument is what stops the next
   * table being forgotten the same way: adding one has to fail the build.
   */
  projectBlobs: { project_ref: string; vault_blob: string }[],
) {
  const { supabase, user } = await requireUser();

  const { error: metaError } = await supabase.from("vault").update(meta).eq("user_id", user.id);
  if (metaError) throw new Error(metaError.message);

  for (const { connection_id, vault_blob } of blobs) {
    const { error } = await supabase
      .from("connection_secrets")
      .update({ vault_blob, updated_at: new Date().toISOString() })
      .eq("connection_id", connection_id);
    if (error) throw new Error(error.message);
  }

  for (const { project_ref, vault_blob } of projectBlobs) {
    const { error } = await supabase
      .from("project_secrets")
      .update({ vault_blob, updated_at: new Date().toISOString() })
      .eq("project_ref", project_ref)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }
}

export async function listConnectionSecrets(): Promise<ConnectionSecret[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("connection_secrets")
    .select("connection_id, supabase_login_method, supabase_email, vault_blob");
  if (error) throw new Error(error.message);
  return (data ?? []) as ConnectionSecret[];
}

/**
 * The blob is stored verbatim. The server cannot read it, cannot validate it, and must not try —
 * only the identity fields, which are deliberately plaintext, get checked here.
 *
 * Omitting `vaultBlob` leaves the stored one alone, which is what a save from a locked vault must do:
 * identity is editable without the key, and there is nothing to re-encrypt. That path uses UPDATE
 * rather than an upsert with the column left out, because whether PostgREST's ON CONFLICT clause
 * preserves a column absent from the payload is not documented for a single-row upsert — and writing
 * a null there would destroy the password irreversibly.
 */
export async function saveConnectionSecret(input: {
  connectionId: string;
  supabaseLoginMethod: string | null;
  supabaseEmail: string | null;
  vaultBlob?: string | null;
}): Promise<void> {
  const { supabase, user } = await requireUser();

  const method = input.supabaseLoginMethod;
  if (method && !METHOD_VALUES.includes(method as Method)) {
    throw new Error(`Unknown sign-in method: ${method}`);
  }

  const identity = {
    supabase_login_method: method,
    supabase_email: input.supabaseEmail?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.vaultBlob === undefined) {
    // .select() so the result carries the affected rows and an absent secret can be told apart from
    // a successful update.
    const { data, error } = await supabase
      .from("connection_secrets")
      .update(identity)
      .eq("connection_id", input.connectionId)
      .select("connection_id");
    if (error) throw new Error(error.message);

    if ((data ?? []).length === 0) {
      const { error: insertError } = await supabase
        .from("connection_secrets")
        .insert({ connection_id: input.connectionId, user_id: user.id, ...identity, vault_blob: null });
      if (insertError) throw new Error(insertError.message);
    }
  } else {
    const { error } = await supabase.from("connection_secrets").upsert(
      { connection_id: input.connectionId, user_id: user.id, ...identity, vault_blob: input.vaultBlob },
      { onConflict: "connection_id" },
    );
    if (error) throw new Error(error.message);
  }

  // Without this the connections page keeps the secrets it rendered with, so reopening the dialog
  // hands the form a stale null and it looks like nothing was saved.
  revalidatePath("/connections");
}
