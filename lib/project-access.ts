import "server-only";
import { resolveProject } from "./inventory";
import { projectSecret } from "./project-secrets";
import { requireUser } from "./supabase/server";
import type { Method } from "./credential-methods";

/**
 * What it takes to open a project in the original: whose account it lives in and how that account
 * signs in. The two blobs are ciphertext the server cannot read; they decrypt in the browser.
 *
 * Read by the Overview page and served as the `access` part — a GET, not a server action: actions
 * run one at a time per client, so a long `runSql` would hold the popover on its skeleton.
 */
export type ProjectAccess = {
  connectionId: string;
  account: string;
  orgName: string | null;
  method: Method | null;
  email: string | null;
  accountBlob: string | null;
  dbBlob: string | null;
};

export async function readProjectAccess(ref: string): Promise<ProjectAccess | null> {
  const found = await resolveProject(ref);
  if (!found) return null;

  const { supabase } = await requireUser();
  const [{ data, error }, dbBlob] = await Promise.all([
    supabase
      .from("connection_secrets")
      .select("supabase_login_method, supabase_email, vault_blob")
      .eq("connection_id", found.connection.id)
      .maybeSingle(),
    projectSecret(ref),
  ]);
  if (error) throw new Error(error.message);

  return {
    connectionId: found.connection.id,
    account: found.connection.display_name,
    orgName: found.connection.org_name,
    method: (data?.supabase_login_method as Method | null) ?? null,
    email: (data?.supabase_email as string | null) ?? null,
    accountBlob: (data?.vault_blob as string | null) ?? null,
    dbBlob,
  };
}
