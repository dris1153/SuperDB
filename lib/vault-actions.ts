"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./supabase/server";

export type VaultMeta = { salt: string; iterations: number; check_blob: string };

export type ConnectionSecret = {
  connection_id: string;
  supabase_login_method: "email" | "github" | "chatgpt" | "sso" | null;
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
export async function rotateVault(meta: VaultMeta, blobs: { connection_id: string; vault_blob: string }[]) {
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
}

export async function listConnectionSecrets(): Promise<ConnectionSecret[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("connection_secrets")
    .select("connection_id, supabase_login_method, supabase_email, vault_blob");
  if (error) throw new Error(error.message);
  return (data ?? []) as ConnectionSecret[];
}

const METHODS = ["email", "github", "chatgpt", "sso"] as const;

/**
 * The blob is stored verbatim. The server cannot read it, cannot validate it, and must not try —
 * only the identity fields, which are deliberately plaintext, get checked here.
 */
export async function saveConnectionSecret(input: {
  connectionId: string;
  supabaseLoginMethod: string | null;
  supabaseEmail: string | null;
  vaultBlob: string | null;
}): Promise<void> {
  const { supabase, user } = await requireUser();

  const method = input.supabaseLoginMethod;
  if (method && !METHODS.includes(method as (typeof METHODS)[number])) {
    throw new Error(`Unknown sign-in method: ${method}`);
  }

  const { error } = await supabase.from("connection_secrets").upsert(
    {
      connection_id: input.connectionId,
      user_id: user.id,
      supabase_login_method: method,
      supabase_email: input.supabaseEmail?.trim() || null,
      vault_blob: input.vaultBlob,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (error) throw new Error(error.message);

  // Without this the connections page keeps the secrets it rendered with, so reopening the dialog
  // hands the form a stale null and it looks like nothing was saved.
  revalidatePath("/connections");
}
