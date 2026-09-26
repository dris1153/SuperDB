import "server-only";
import { requireUser } from "./supabase/server";
import { isProjectRef } from "./project-ref";

/**
 * A project's vault entry — currently its database password.
 *
 * The blob is stored verbatim. The server cannot read it, cannot validate it, and must not try: the
 * key is derived from a master password that never leaves the browser. Only the ref is checked here,
 * and only because it is the key.
 *
 * Not a "use server" module. Every export of one becomes an action the browser can call, and the read
 * is used on the server — the same reason write-audit.ts stays out. The browser does get the blob, but
 * through the `access` part, after that part has established the project is the caller's. The browser-facing half
 * is `project-secret-actions.ts`: a `"use server"` file may only export async functions, so the
 * wrapper cannot live in a page, as this comment used to claim.
 */

/**
 * Generous next to an encrypted password, tight enough that the column cannot grow unnoticed.
 * saveConnectionSecret has no cap at all, which a review flagged; no reason to repeat it here.
 */
const MAX_BLOB = 8_000;

/** Null when nothing is stored, which is the normal state for a project nobody has typed one for. */
export async function projectSecret(ref: string): Promise<string | null> {
  if (!isProjectRef(ref)) return null;

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("project_secrets")
    .select("vault_blob")
    .eq("project_ref", ref)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return (data?.vault_blob as string | null) ?? null;
}

/**
 * Every stored project blob for the signed-in user.
 *
 * Exists for `rotateVault`, which re-encrypts everything under a new key and would otherwise have no
 * way to see these rows — see the comment there.
 */
export async function listProjectSecrets(): Promise<{ project_ref: string; vault_blob: string }[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("project_secrets")
    .select("project_ref, vault_blob")
    .not("vault_blob", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? []) as { project_ref: string; vault_blob: string }[];
}

/** Passing null clears the entry — the caller decides that, never this function. */
export async function saveProjectSecret(ref: string, blob: string | null): Promise<void> {
  if (!isProjectRef(ref)) throw new Error("Unknown project");
  if (blob !== null && (typeof blob !== "string" || blob.length > MAX_BLOB)) {
    throw new Error("Invalid credential");
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("project_secrets").upsert(
    { user_id: user.id, project_ref: ref, vault_blob: blob, updated_at: new Date().toISOString() },
    { onConflict: "user_id,project_ref" },
  );
  if (error) throw new Error(error.message);
}
