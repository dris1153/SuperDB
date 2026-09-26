"use server";

import { resolveProject } from "./inventory";
import { updateAuthConfig } from "./mgmt-api";
import { attempt } from "./safe";
import { oauthServerPatch } from "./oauth-server";
import { recordWrite } from "./write-audit";
import type { ConfigResult } from "./auth-config-actions";

/**
 * The OAuth Server's three fields, always together. GoTrue picks the change up about a minute later
 * (measured), so the caller says so rather than this reading back a state that has not landed.
 */
export async function saveOAuthServer(
  projectRef: string,
  input: { enabled: boolean; path: string; dynamic: boolean },
): Promise<ConfigResult> {
  const built = oauthServerPatch(input);
  if (!built.ok) return built;

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateAuthConfig(found.token, projectRef, built.body));

  await recordWrite({
    ref: projectRef,
    what: "OAuth server settings",
    outcome: result.ok
      ? `saved: server ${input.enabled ? "on" : "off"}, dynamic registration ${input.dynamic ? "on" : "off"}`
      : `save failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
