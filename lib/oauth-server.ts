/**
 * The OAuth Server page's three fields of `/config/auth`, and the endpoints it publishes.
 *
 * Measured 2026-09-26 on a scratch project:
 *
 * ```
 * {enabled: true,  path: "oauth/consent"}   400 "…must be a valid URL path starting with "/""
 * {enabled: true,  path: ""}                400 "…must be set when OAUTH_SERVER_ENABLED is true"
 * {enabled: false, path: "/oauth/consent"}  200, and the path reads back
 * {allow_dynamic_registration: true}        200 on its own
 * ```
 *
 * `oauth_server_enabled` alone is refused (measured 2026-09-25), so a save always carries all three,
 * as the original does. Clients survive a disable and re-enable — measured with one registered.
 */

export const DEFAULT_AUTHORIZATION_PATH = "/oauth/consent";

export type OAuthEndpoint = { label: string; url: string };

export type OAuthServerConfig = {
  enabled: boolean;
  /** The saved path, or the original's default when none is. */
  path: string;
  dynamic: boolean;
  siteUrl: string | null;
  /** Null when the discovery document could not be read — the form still works without it. */
  endpoints: OAuthEndpoint[] | null;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export function pickOAuthServer(raw: Record<string, unknown>, discovery: unknown): OAuthServerConfig {
  return {
    enabled: raw.oauth_server_enabled === true,
    path: text(raw.oauth_server_authorization_path) ?? DEFAULT_AUTHORIZATION_PATH,
    dynamic: raw.oauth_server_allow_dynamic_registration === true,
    siteUrl: text(raw.site_url),
    endpoints: endpointsFrom(discovery),
  };
}

/**
 * The four URLs the original lists, from the project's discovery document rather than assembled
 * here — so they stay right on a custom domain. The document is public and answers while the server
 * is off (measured).
 */
export function endpointsFrom(doc: unknown): OAuthEndpoint[] | null {
  if (typeof doc !== "object" || doc === null) return null;
  const d = doc as Record<string, unknown>;
  const issuer = text(d.issuer);

  const rows = [
    { label: "Authorization endpoint", url: text(d.authorization_endpoint) },
    { label: "Token endpoint", url: text(d.token_endpoint) },
    { label: "JWKS endpoint", url: text(d.jwks_uri) },
    { label: "OIDC discovery", url: issuer && `${issuer}/.well-known/openid-configuration` },
  ].filter((row): row is OAuthEndpoint => row.url !== null);

  return rows.length ? rows : null;
}

export function previewAuthorizationUrl(siteUrl: string | null, path: string): string | null {
  if (!siteUrl) return null;
  return `${siteUrl.replace(/\/+$/, "")}${path.trim() || DEFAULT_AUTHORIZATION_PATH}`;
}

/** The PATCH body, or the reason there is not one — the two refusals above, caught before sending. */
export function oauthServerPatch(
  input: unknown,
): { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "Nothing to save." };
  const { enabled, path, dynamic } = input as Record<string, unknown>;

  if (typeof enabled !== "boolean" || typeof dynamic !== "boolean") {
    return { ok: false, reason: "Those settings are on or off." };
  }
  if (typeof path !== "string" || path.length > 500) {
    return { ok: false, reason: "The authorization path is text." };
  }

  const trimmed = path.trim();
  if (enabled && !trimmed) {
    return { ok: false, reason: "Authorization Path is required when OAuth Server is enabled." };
  }
  if (trimmed && !trimmed.startsWith("/")) {
    return { ok: false, reason: 'The authorization path must start with "/".' };
  }

  return {
    ok: true,
    body: {
      oauth_server_enabled: enabled,
      oauth_server_authorization_path: trimmed || null,
      oauth_server_allow_dynamic_registration: dynamic,
    },
  };
}
