"use server";

import { redirect } from "next/navigation";
import { connectionsWithTokens, removeConnection } from "./connections";
import { requireUser } from "./supabase/server";

/**
 * Revokes every OAuth grant before deleting the account. Doing it the other way round would leave
 * grants sitting in people's Supabase settings with nothing on this side to revoke them from.
 *
 * The delete itself goes through a security definer function scoped to auth.uid(); the alternative
 * was giving the app a service_role key that bypasses RLS everywhere.
 */
export async function deleteAccount() {
  const { supabase } = await requireUser();

  const connections = await connectionsWithTokens();
  for (const connection of connections) {
    try {
      await removeConnection(connection.id);
    } catch {
      // A grant already revoked upstream must not block the deletion.
    }
  }

  const { error } = await supabase.rpc("delete_own_account");
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);

  await supabase.auth.signOut();
  redirect("/login");
}
