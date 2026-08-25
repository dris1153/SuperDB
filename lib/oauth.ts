import "server-only";
import { createHash, randomBytes } from "node:crypto";

const BASE = "https://api.supabase.com";

export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

function config() {
  const clientId = process.env.SB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SB_OAUTH_CLIENT_SECRET;
  const siteUrl = process.env.SITE_URL;
  if (!clientId || !clientSecret || !siteUrl) {
    throw new Error("SB_OAUTH_CLIENT_ID, SB_OAUTH_CLIENT_SECRET and SITE_URL must all be set");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${siteUrl.replace(/\/+$/, "")}/api/connect/callback`,
  };
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/**
 * No `scope` parameter — it is deprecated. Scopes are fixed when the OAuth app is registered in the
 * Supabase dashboard, and changing them there forces every existing user to re-authorize.
 */
export function authorizeUrl({ state, challenge }: { state: string; challenge: string }): string {
  const { clientId, redirectUri } = config();
  const url = new URL(`${BASE}/v1/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** The token endpoint takes a form-encoded body and Basic auth. JSON or body credentials both fail. */
async function requestTokens(body: Record<string, string>): Promise<OAuthTokens> {
  const { clientId, clientSecret } = config();
  const res = await fetch(`${BASE}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`oauth/token ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return (await res.json()) as OAuthTokens;
}

export const exchangeCode = ({ code, verifier }: { code: string; verifier: string }) =>
  requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: config().redirectUri,
    code_verifier: verifier,
  });

export const refreshTokens = (refreshToken: string) =>
  requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });

/** Best effort: a token the user already revoked upstream should not block disconnecting here. */
export async function revoke(refreshToken: string): Promise<void> {
  const { clientId, clientSecret } = config();
  await fetch(`${BASE}/v1/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
    cache: "no-store",
  }).catch(() => {});
}
