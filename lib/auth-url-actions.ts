"use server";

import { resolveProject } from "./inventory";
import { getAuthConfig, updateAuthConfig } from "./mgmt-api";
import { attempt } from "./safe";
import { MAX_ALLOW_LIST, parseRedirectUrls, siteUrlProblem, withAdded, withoutUrls } from "./auth-urls";
import { recordWrite } from "./write-audit";
import type { ConfigResult } from "./auth-config-actions";

const MAX_ROWS = 200;
// The saved list is capped at 2 KiB, so a request carrying more than that cannot be a valid one.
const isUrls = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_ROWS && value.every((v) => typeof v === "string") &&
  value.join(",").length <= MAX_ALLOW_LIST;
const TOO_MANY = "Too many redirect URLs, please remove some or try to use wildcards";

export async function saveSiteUrl(projectRef: string, value: string): Promise<ConfigResult> {
  if (typeof value !== "string" || value.length > MAX_ALLOW_LIST) return { ok: false, reason: "The Site URL is one URL." };
  const problem = siteUrlProblem(value);
  if (problem) return { ok: false, reason: problem };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const url = value.trim();
  const result = await attempt(() => updateAuthConfig(found.token, projectRef, { site_url: url }));
  await recordWrite({
    ref: projectRef,
    what: "Site URL",
    outcome: result.ok ? `saved: ${url.slice(0, 200)}` : `save failed: ${result.reason.slice(0, 200)}`,
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * The list is read here and the change applied to it, rather than the browser sending the whole
 * list back: a URL added in the Supabase dashboard since this page loaded would otherwise be lost.
 */
async function changeList(
  projectRef: string,
  what: string,
  next: (current: string[]) => { ok: true; list: string } | { ok: false; reason: string } | "unchanged",
): Promise<ConfigResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const read = await attempt(() => getAuthConfig(found.token, projectRef));
  if (!read.ok) return { ok: false, reason: read.reason };
  const built = next(parseRedirectUrls(read.data?.uri_allow_list));
  // Already gone — removed elsewhere since the page loaded. Nothing to write, nothing to audit.
  if (built === "unchanged") return { ok: true };
  if (!built.ok) return built;

  const result = await attempt(() => updateAuthConfig(found.token, projectRef, { uri_allow_list: built.list }));
  await recordWrite({
    ref: projectRef,
    what: "Redirect URLs",
    outcome: result.ok ? what.slice(0, 300) : `${what.slice(0, 200)} — failed: ${result.reason.slice(0, 200)}`,
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function addRedirectUrls(projectRef: string, urls: string[]): Promise<ConfigResult> {
  if (!isUrls(urls)) return { ok: false, reason: TOO_MANY };
  return changeList(projectRef, `added: ${urls.join(", ")}`, (current) => withAdded(current, urls));
}

export async function removeRedirectUrls(projectRef: string, urls: string[]): Promise<ConfigResult> {
  if (!Array.isArray(urls) || urls.length === 0 || !urls.every((u) => typeof u === "string")) {
    return { ok: false, reason: "Nothing to remove." };
  }
  return changeList(projectRef, `removed: ${urls.join(", ")}`, (current) =>
    current.some((url) => urls.includes(url)) ? { ok: true, list: withoutUrls(current, urls) } : "unchanged",
  );
}
