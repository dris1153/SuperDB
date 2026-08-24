import "server-only";
import { decrypt, encrypt } from "./crypto";
import { getProfile } from "./mgmt-api";
import { requireUser } from "./supabase/server";

const SAFE_COLUMNS = "id, gotrue_id, email, username, label, token_hint, created_at, synced_at";

export type Account = {
  id: string;
  gotrue_id: string;
  email: string;
  username: string | null;
  label: string | null;
  token_hint: string;
  created_at: string;
  synced_at: string | null;
};

/** Never selects token_cipher — safe to hand to a client component. */
export async function listAccounts(): Promise<Account[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("supabase_accounts")
    .select(SAFE_COLUMNS)
    .order("email");
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

/** Server-only: the plaintext PAT. Must never cross the network to a browser. */
export async function accountsWithTokens(): Promise<(Account & { token: string })[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("supabase_accounts")
    .select(`${SAFE_COLUMNS}, token_cipher`)
    .order("email");
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ token_cipher, ...rest }) => ({
    ...(rest as Account),
    token: decrypt(token_cipher as string),
  }));
}

export async function accountToken(id: string): Promise<{ account: Account; token: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("supabase_accounts")
    .select(`${SAFE_COLUMNS}, token_cipher`)
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Account not found");
  const { token_cipher, ...rest } = data;
  return { account: rest as Account, token: decrypt(token_cipher as string) };
}

/** Verifies the token against GET /v1/profile before storing it — that call also gives us the email. */
export async function addAccount(pat: string, label: string | null) {
  const token = pat.trim();
  if (!token.startsWith("sbp_") || token.length < 24) {
    throw new Error("That does not look like a personal access token (expected sbp_…)");
  }
  const profile = await getProfile(token);
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("supabase_accounts").upsert(
    {
      user_id: user.id,
      gotrue_id: profile.gotrue_id,
      email: profile.primary_email,
      username: profile.username,
      label,
      token_cipher: encrypt(token),
      token_hint: token.slice(-4),
      synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,gotrue_id" },
  );
  if (error) throw new Error(error.message);
  return profile;
}

export async function removeAccount(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("supabase_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
