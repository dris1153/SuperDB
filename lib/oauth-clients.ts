/**
 * The clients that can use a project as an identity provider.
 *
 * Pure: the shape of the list, the rules for creating one, and nothing that talks to an API.
 */
export type OAuthClient = {
  client_id: string;
  client_name?: string | null;
  client_type: string;
  registration_type?: string | null;
  redirect_uris?: string[] | null;
  token_endpoint_auth_method?: string | null;
  created_at: string;
  updated_at?: string | null;
  /**
   * In the 201 from create, and in a single `GET /admin/oauth/clients/{id}` — **not** in the list.
   * Measured 2026-09-26, correcting an earlier note that said a read did not carry it either.
   * Nothing in this app reads one client, so the create dialog is still the only place it appears.
   */
  client_secret?: string;
};

/**
 * The list, out of a body that has two shapes.
 *
 * ```
 * GET /admin/oauth/clients   (none)  200  {}
 * GET /admin/oauth/clients   (two)   200  {"clients":[…]}
 * ```
 *
 * `body.clients ?? []` is not enough — this is the trap `listSigningKeys` has a test for, arriving
 * a second time, and on a bare array `.clients` would be undefined while `.keys` was a function.
 */
export function clientsFrom(body: unknown): OAuthClient[] {
  if (!body || typeof body !== "object") return [];
  const clients = (body as { clients?: unknown }).clients;
  return Array.isArray(clients) ? (clients as OAuthClient[]) : [];
}

export const CLIENT_TYPES = ["confidential", "public"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const isClientType = (value: unknown): value is ClientType =>
  (CLIENT_TYPES as readonly unknown[]).includes(value);

/**
 * Derived, never chosen. Measured: a confidential client comes back with `client_secret_basic` and
 * a public one with `none`, whatever the caller sends.
 */
export const authMethodFor = (type: ClientType) =>
  type === "confidential" ? "client_secret_basic" : "none";

const MAX_URIS = 10;

/**
 * What is wrong with the redirect URIs, or null.
 *
 * A redirect URI is where the authorization code is sent, so a malformed one is a client that
 * cannot complete a sign-in and a wrong one sends codes somewhere else. `http` is allowed because
 * local development needs it; anything that is not http or https is refused.
 */
export function redirectUriProblem(uris: string[]): string | null {
  if (!Array.isArray(uris) || uris.length === 0) return "At least one redirect URI is required.";
  if (uris.length > MAX_URIS) return `At most ${MAX_URIS} redirect URIs.`;

  for (const uri of uris) {
    if (typeof uri !== "string" || uri.trim() === "") return "A redirect URI cannot be blank.";

    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return `${uri} is not a URL.`;
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return `${uri} is not an http or https URL.`;
    }
  }

  return null;
}

export function clientNameProblem(name: unknown): string | null {
  if (typeof name !== "string" || name.trim() === "") return "A name is required.";
  if (name.length > 100) return "That name is too long.";
  return null;
}

/** The list as the table reads it, newest first — the API does not promise an order. */
export const sortClients = (clients: OAuthClient[]): OAuthClient[] =>
  [...clients].sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));
