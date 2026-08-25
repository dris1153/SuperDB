import "server-only";
import { open, seal } from "./crypto";
import { listOrgs } from "./mgmt-api";
import { refreshTokens, revoke, type OAuthTokens } from "./oauth";
import { requireUser } from "./supabase/server";

export type ConnectionKind = "pat" | "oauth";

/** Never selects dek_wrapped or secret_cipher — safe to hand to a client component. */
const SAFE_COLUMNS =
  "id, kind, sb_account_id, email, org_slug, org_name, label, token_hint, created_at, synced_at, last_error";

export type Connection = {
  id: string;
  kind: ConnectionKind;
  sb_account_id: string | null;
  email: string | null;
  org_slug: string | null;
  org_name: string | null;
  label: string | null;
  token_hint: string;
  created_at: string;
  synced_at: string | null;
  last_error: string | null;
};

/** Organization name: no token kind can reach an account email any more. Email is a legacy column. */
export const ownerLabel = (c: Connection) => c.email ?? c.org_name ?? c.org_slug ?? "unknown";

export function connectModes(): ConnectionKind[] {
  const raw = process.env.CONNECT_MODES ?? "pat,oauth";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ConnectionKind => s === "pat" || s === "oauth");
}

export const modeEnabled = (kind: ConnectionKind) => connectModes().includes(kind);

type Secret = { access: string; refresh: string | null };

function sealSecret(secret: Secret) {
  const { dekWrapped, cipher } = seal(JSON.stringify(secret));
  return { dek_wrapped: dekWrapped, secret_cipher: cipher };
}

const openSecret = (row: { dek_wrapped: string; secret_cipher: string }): Secret =>
  JSON.parse(open(row.dek_wrapped, row.secret_cipher));

function oauthColumns(tokens: OAuthTokens) {
  return {
    ...sealSecret({ access: tokens.access_token, refresh: tokens.refresh_token ?? null }),
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    token_hint: tokens.access_token.slice(-4),
  };
}

export async function listConnections(): Promise<Connection[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("connections").select(SAFE_COLUMNS).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Connection[];
}

// Refresh a little before expiry rather than on the 401, so a normal page load never races the clock.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Row = Connection & { dek_wrapped: string; secret_cipher: string; expires_at: string | null };

/**
 * A failed refresh means the user revoked the app upstream. Record it and leave the row alone so the
 * UI can offer Reconnect; retrying in a loop would only burn the remaining grant.
 */
async function accessTokenFor(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  row: Row,
): Promise<string> {
  const secret = openSecret(row);
  if (row.kind !== "oauth" || !secret.refresh || !row.expires_at) return secret.access;
  if (Date.parse(row.expires_at) - Date.now() > REFRESH_MARGIN_MS) return secret.access;

  try {
    const tokens = await refreshTokens(secret.refresh);
    await supabase
      .from("connections")
      .update({ ...oauthColumns(tokens), synced_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    return tokens.access_token;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("connections").update({ last_error: message }).eq("id", row.id);
    throw new Error(`Reconnect required: ${message}`);
  }
}

/**
 * Server-only: plaintext tokens. Must never cross the network to a browser.
 *
 * A connection whose refresh failed comes back with a null token rather than being dropped, so the
 * caller can show it as needing reconnection instead of silently losing the row.
 */
export async function connectionsWithTokens(): Promise<(Connection & { token: string | null })[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("connections")
    .select(`${SAFE_COLUMNS}, dek_wrapped, secret_cipher, expires_at`)
    .order("created_at");
  if (error) throw new Error(error.message);

  return Promise.all(
    (data ?? []).map(async (raw) => {
      const row = raw as Row;
      try {
        return { ...stripSecrets(row), token: await accessTokenFor(supabase, row) };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ...stripSecrets(row), token: null, last_error: message };
      }
    }),
  );
}

function stripSecrets(row: Row): Connection {
  const { dek_wrapped, secret_cipher, expires_at, ...rest } = row;
  return rest;
}

export async function connectionToken(id: string): Promise<{ connection: Connection; token: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("connections")
    .select(`${SAFE_COLUMNS}, dek_wrapped, secret_cipher, expires_at`)
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Connection not found");

  const row = data as Row;
  return { connection: stripSecrets(row), token: await accessTokenFor(supabase, row) };
}

/**
 * Validates a token and names its row in one call.
 *
 * Not /v1/profile: Supabase stopped issuing user-scoped tokens, so that endpoint answers
 * "This endpoint requires a user-scoped access token" for anything this app can be handed. An
 * organization is the only identity available, for access tokens and OAuth grants alike.
 */
async function orgFor(token: string) {
  const org = (await listOrgs(token))[0];
  if (!org) throw new Error("That token reaches no organization");
  return org;
}

export async function addPatConnection(pat: string, label: string | null) {
  if (!modeEnabled("pat")) throw new Error("Token connections are disabled on this instance");

  const token = pat.trim();
  if (!token.startsWith("sbp_") || token.length < 24) {
    throw new Error("That does not look like an access token (expected sbp_…)");
  }

  const org = await orgFor(token);
  await write({
    kind: "pat",
    match: { org_slug: org.slug },
    values: {
      org_slug: org.slug,
      org_name: org.name,
      label,
      ...sealSecret({ access: token, refresh: null }),
      token_hint: token.slice(-4),
      expires_at: null,
    },
  });
  return org;
}

export async function addOAuthConnection(tokens: OAuthTokens) {
  if (!modeEnabled("oauth")) throw new Error("OAuth connections are disabled on this instance");

  const org = await orgFor(tokens.access_token);
  await write({
    kind: "oauth",
    match: { org_slug: org.slug },
    values: { org_slug: org.slug, org_name: org.name, ...oauthColumns(tokens) },
  });
  return org;
}

/** Select-then-write: the unique index guards integrity, and this avoids upserting onto an expression. */
async function write({
  kind,
  match,
  values,
}: {
  kind: ConnectionKind;
  match: Record<string, string>;
  values: Record<string, unknown>;
}) {
  const { supabase, user } = await requireUser();
  const row = { ...values, synced_at: new Date().toISOString(), last_error: null };

  const { data: existing } = await supabase
    .from("connections")
    .select("id")
    .eq("kind", kind)
    .match(match)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("connections").update(row).eq("id", existing.id)
    : await supabase.from("connections").insert({ ...row, user_id: user.id, kind });
  if (error) throw new Error(error.message);
}

export async function removeConnection(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("connections")
    .select("kind, dek_wrapped, secret_cipher")
    .eq("id", id)
    .maybeSingle();

  // Revoke upstream first so the grant disappears from the user's Supabase settings too.
  if (data?.kind === "oauth") {
    const secret = openSecret(data as { dek_wrapped: string; secret_cipher: string });
    if (secret.refresh) await revoke(secret.refresh);
  }

  const { error } = await supabase.from("connections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
