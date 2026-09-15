import "server-only";
import { recordEvent } from "./audit";
import { normaliseTags } from "./tags";
import { open, seal } from "./crypto";
import { listOrgs } from "./mgmt-api";
import { refreshTokens, revoke, type OAuthTokens } from "./oauth";
import { requireUser } from "./supabase/server";

export type ConnectionKind = "pat" | "oauth";

/** Never selects dek_wrapped or secret_cipher — safe to hand to a client component. */
const SAFE_COLUMNS =
  "id, kind, sb_account_id, email, org_slug, org_name, display_name, tags, token_hint, created_at, synced_at, last_error";

export type Connection = {
  id: string;
  kind: ConnectionKind;
  sb_account_id: string | null;
  email: string | null;
  org_slug: string | null;
  org_name: string | null;
  display_name: string;
  tags: string[];
  token_hint: string;
  created_at: string;
  synced_at: string | null;
  last_error: string | null;
};

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
  const { data, error } = await supabase
    .from("connections")
    .select(SAFE_COLUMNS)
    .order("sort_order", { nullsFirst: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Connection[];
}

// Refresh a little before expiry rather than on the 401, so a normal page load never races the clock.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Row = Connection & { dek_wrapped: string; secret_cipher: string; expires_at: string | null };

/**
 * One refresh per connection at a time, within this process.
 *
 * A refresh token is single-use and Supabase rotates it, so concurrent refreshes of the same
 * connection have exactly one winner. That used to be theoretical — a page render refreshed once —
 * and the read endpoints made it ordinary: nine parts are nine requests, all of them resolving the
 * same connection inside the same second. Sharing the in-flight promise means one upstream call and
 * one audit event instead of nine, and nothing for the losers to mis-handle.
 *
 * Per process, so several instances can still race; the re-read below is what covers that.
 */
const refreshes = new Map<string, Promise<string>>();

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

  const inFlight = refreshes.get(row.id);
  if (inFlight) return inFlight;

  const refresh = refreshOnce(supabase, row, secret.refresh).finally(() => refreshes.delete(row.id));
  refreshes.set(row.id, refresh);
  return refresh;
}

async function refreshOnce(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  row: Row,
  refreshToken: string,
): Promise<string> {
  try {
    const tokens = await refreshTokens(refreshToken);
    await supabase
      .from("connections")
      .update({ ...oauthColumns(tokens), synced_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    await recordEvent(supabase, {
      connectionId: row.id,
      owner: row.display_name,
      kind: row.kind,
      event: "refreshed",
    });
    return tokens.access_token;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    // A refresh token is single-use: Supabase rotates it, so when several requests refresh the same
    // connection at once exactly one wins and the rest fail on a token that is no longer current.
    // That is not a revoked grant, and recording it as one would put a healthy connection into
    // "Reconnect required" and 404 every read through it. Re-read the row: if someone else rotated
    // it while this call was in flight, use what they stored.
    const { data: fresh } = await supabase
      .from("connections")
      .select(`${SAFE_COLUMNS}, dek_wrapped, secret_cipher, expires_at`)
      .eq("id", row.id)
      .maybeSingle();

    if (fresh && (fresh as Row).expires_at !== row.expires_at) {
      return openSecret(fresh as Row).access;
    }

    await supabase.from("connections").update({ last_error: message }).eq("id", row.id);
    await recordEvent(supabase, {
      connectionId: row.id,
      owner: row.display_name,
      kind: row.kind,
      event: "refresh_failed",
      detail: message,
    });
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
    // nulls last and created_at as tiebreak, so the order stays total even for a row the backfill
    // missed or two that briefly share a number after a reorder.
    .order("sort_order", { nullsFirst: false })
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

export async function addPatConnection(pat: string, tags: string[]) {
  if (!modeEnabled("pat")) throw new Error("Token connections are disabled on this instance");

  const token = pat.trim();
  if (!token.startsWith("sbp_") || token.length < 24) {
    throw new Error("That does not look like an access token (expected sbp_…)");
  }

  const org = await orgFor(token);
  await write({
    kind: "pat",
    org,
    tags,
    values: {
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
  await write({ kind: "oauth", org, tags: [], values: oauthColumns(tokens) });
  return org;
}

/**
 * Where a newly connected account goes: last. Reads the current maximum rather than counting rows,
 * because a deleted connection leaves a gap and a count would collide with an existing number.
 *
 * Returns null when rows exist but none is numbered yet — no integer sorts after a null under
 * `nulls last`, so the honest answer is to join the unnumbered group, where created_at still puts
 * this one at the end.
 *
 * The error is checked rather than swallowed: falling back to a default here would silently place a
 * new connection first, which is the one position a user notices and did not ask for.
 */
async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("connections")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!data) return 1;
  const max = data.sort_order as number | null;
  return max === null ? null : max + 1;
}

/**
 * Select-then-write: the unique index guards integrity, and this avoids upserting onto an expression.
 *
 * display_name and tags are set on insert only. They belong to the user, and folding them into the
 * update would mean every OAuth re-authorization or re-pasted token silently reset the name they
 * chose and erased their tags. org_name is the opposite case: it mirrors Supabase, so it does follow
 * a rename upstream.
 */
async function write({
  kind,
  org,
  tags,
  values,
}: {
  kind: ConnectionKind;
  org: { slug: string; name: string };
  tags: string[];
  values: Record<string, unknown>;
}) {
  const { supabase, user } = await requireUser();
  const always = {
    ...values,
    org_slug: org.slug,
    org_name: org.name,
    synced_at: new Date().toISOString(),
    last_error: null,
  };

  const { data: existing } = await supabase
    .from("connections")
    .select("id")
    .eq("kind", kind)
    .eq("org_slug", org.slug)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("connections").update(always).eq("id", existing.id)
    : await supabase.from("connections").insert({
        ...always,
        user_id: user.id,
        kind,
        display_name: org.name,
        tags: normaliseTags(tags),
        // Insert-only, like display_name and tags: re-authorizing must never move a connection the
        // user has placed. A concurrent connect can pick the same number; nothing enforces
        // uniqueness and the created_at tiebreak keeps the order total until one is re-dragged.
        sort_order: await nextSortOrder(supabase, user.id),
      });
  if (error) throw new Error(error.message);

  await recordEvent(supabase, {
    connectionId: existing?.id,
    owner: org.name,
    kind,
    event: "connected",
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Far above any plausible number of connected accounts; a bound, not a product decision. */
const MAX_REORDER = 500;

/**
 * Writes a whole ordering in one statement, through public.reorder_connections.
 *
 * An RPC rather than a loop of updates on purpose: rotateVault already loops independent writes with
 * no transaction, and a failure partway through it leaves an inconsistent vault. One statement means
 * a partial reorder cannot exist rather than merely being unlikely.
 *
 * The client's order is taken as given — it is a user preference with nothing to validate against,
 * and RLS bounds the write to the caller's own rows.
 */
export async function reorderConnections(ids: string[]): Promise<void> {
  // A server action's arguments are client input; the string[] type is erased at runtime. RLS bounds
  // what a hostile array can reach, but a malformed uuid would surface as a raw Postgres error and
  // an unbounded one makes array_position scan per row, so both are refused here instead.
  if (!Array.isArray(ids) || ids.length > MAX_REORDER) {
    throw new Error("Invalid connection order");
  }
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new Error("Invalid connection order");
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("reorder_connections", { ids });
  if (error) throw new Error(error.message);
}

/** The only path that may change display_name or tags after the first connect. */
export async function updateConnection(
  id: string,
  fields: { display_name: string; tags: string[] },
) {
  const { supabase } = await requireUser();
  const name = fields.display_name.trim();
  if (!name) throw new Error("Name cannot be empty");

  const { error } = await supabase
    .from("connections")
    .update({ display_name: name, tags: normaliseTags(fields.tags) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Every tag the user has used, for the picker. */
export async function listTags(): Promise<string[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("connections").select("tags");
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).flatMap((r) => (r.tags as string[]) ?? []))].sort();
}

export async function removeConnection(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("connections")
    .select("kind, display_name, dek_wrapped, secret_cipher")
    .eq("id", id)
    .maybeSingle();

  // Revoke upstream first so the grant disappears from the user's Supabase settings too.
  if (data?.kind === "oauth") {
    const secret = openSecret(data as { dek_wrapped: string; secret_cipher: string });
    if (secret.refresh) await revoke(secret.refresh);
  }

  const { error } = await supabase.from("connections").delete().eq("id", id);
  if (error) throw new Error(error.message);

  // Written after the delete so a failed delete is not logged as a success. connection_id survives
  // as a dangling reference on purpose — it is the row most worth keeping.
  await recordEvent(supabase, {
    connectionId: id,
    owner: (data as { display_name?: string } | null)?.display_name ?? null,
    kind: data?.kind ?? null,
    event: "disconnected",
  });
}
