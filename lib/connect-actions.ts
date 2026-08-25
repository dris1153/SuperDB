"use server";

import { highlight } from "./highlight";
import { resolveProject } from "./inventory";
import { listApiKeys } from "./mgmt-api";
import { attempt } from "./safe";

export type ServerEnv =
  | { blocked: true; reason: string }
  | { blocked: false; env: string; html: string | null; secretKey: string | null };

/**
 * Fetched on demand rather than with the page.
 *
 * `reveal=true` returns the real secret key — a service-role credential that bypasses RLS on the
 * user's project. Loading it eagerly would put it in the payload of every project page view, whether
 * or not anyone opened this panel. It is fetched only when the Server tab is actually shown.
 */
export async function getServerEnv(projectRef: string): Promise<ServerEnv> {
  const found = await resolveProject(projectRef);
  if (!found) return { blocked: true, reason: "Project not found." };

  // Attempted regardless of connection kind: a 403 names the missing scope and is fixable by
  // re-authorizing, so refusing to even try would hide a problem the user can solve.
  const result = await attempt(() => listApiKeys(found.token, projectRef, true));
  if (!result.ok) return { blocked: true, reason: result.reason };
  const keys = result.data;

  const publishable = keys.find((k) => k.type === "publishable")?.api_key ?? "";
  const secret = keys.find((k) => k.type === "secret")?.api_key ?? "";
  const base = `https://${projectRef}.supabase.co`;

  const env = [
    `SUPABASE_URL=${base}`,
    `SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    `SUPABASE_SECRET_KEY=${secret}`,
    `SUPABASE_JWKS_URL=${base}/auth/v1/.well-known/jwks.json`,
  ].join("\n");

  return {
    blocked: false,
    env,
    html: await highlight(env, "ini"),
    secretKey: secret || null,
  };
}
