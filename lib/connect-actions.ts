"use server";

import { highlight } from "./highlight";
import { resolveProject } from "./inventory";
import { listApiKeys } from "./mgmt-api";
import { isMasked } from "./api-keys";
import { attempt } from "./safe";

export type ServerEnv =
  | { blocked: true; reason: string }
  | { blocked: false; env: string; html: string | null; secretKey: string | null };

/**
 * Fetched on demand rather than with the page: whatever this returns is a credential, and loading it
 * eagerly would put it in the payload of every project page view whether or not anyone opened the
 * panel.
 *
 * **`reveal=true` is not used here, and used to be.** Measured 2026-09-25: that flag needs a token
 * that can both reach the project and carry the api-keys secret permission, and without it the API
 * answers 403 — which turned this whole tab into a `blocked` message that read like a missing OAuth
 * scope. The publishable key comes back complete without the flag; only the secret is withheld, and
 * only from tokens that lack it. So the tab renders what it has and says what it is missing, rather
 * than failing entirely over one field.
 */
export async function getServerEnv(projectRef: string): Promise<ServerEnv> {
  const found = await resolveProject(projectRef);
  if (!found) return { blocked: true, reason: "Project not found." };

  // Attempted regardless of connection kind: a 403 names the missing scope and is fixable by
  // re-authorizing, so refusing to even try would hide a problem the user can solve.
  const result = await attempt(() => listApiKeys(found.token, projectRef));
  if (!result.ok) return { blocked: true, reason: result.reason };
  const keys = result.data;

  const publishable = keys.find((k) => k.type === "publishable")?.api_key ?? "";

  // Masked unless the connection may reveal it, and a mask is the same length as the real thing —
  // 41 characters either way — so this tests the mask character rather than the length.
  const held = keys.find((k) => k.type === "secret")?.api_key ?? "";
  const secret = isMasked(held) ? "" : held;
  const base = `https://${projectRef}.supabase.co`;

  const env = [
    `SUPABASE_URL=${base}`,
    `SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    secret
      ? `SUPABASE_SECRET_KEY=${secret}`
      : `# SUPABASE_SECRET_KEY — this connection may not read it; copy it from the Supabase dashboard`,
    `SUPABASE_JWKS_URL=${base}/auth/v1/.well-known/jwks.json`,
  ].join("\n");

  return {
    blocked: false,
    env,
    html: await highlight(env, "ini"),
    secretKey: secret || null,
  };
}
