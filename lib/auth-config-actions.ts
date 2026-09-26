"use server";

import { resolveProject } from "./inventory";
import { updateAuthConfig } from "./mgmt-api";
import { attempt } from "./safe";
import { isNotificationField, SMTP_CLEAR, smtpPatchFrom, templateFor } from "./auth-config";
import { TEMPLATE_DEFAULTS } from "./auth-template-defaults";
import { recordWrite } from "./write-audit";

export type ConfigResult = { ok: true } | { ok: false; reason: string };

/**
 * Saving one thing without touching the other 242.
 *
 * PATCH merges by key — measured — so each of these sends only what it changed. The alternative,
 * reading the config and sending it back edited, would make every save a chance to overwrite a
 * field somebody changed in the Supabase dashboard a second earlier.
 *
 * **A refusal is not necessarily a no-op.** Measured 2026-09-26: a PATCH carrying both a template
 * field and a notification field answered 400 for the template — and applied the notification
 * anyway. So each of these saves one kind of field, and a failure reported here means that kind
 * did not land rather than that nothing did.
 *
 * **An unknown field is accepted and ignored.** `{superdb_not_a_field: true}` answers 200. Nothing
 * upstream will catch a typo, which is why field names come from the catalogue rather than from
 * the caller — and why a browser cannot name `external_google_secret` here and have it written.
 */
const MAX_SUBJECT = 1000;
const MAX_BODY = 100_000;

export async function saveEmailTemplate(
  projectRef: string,
  key: string,
  subject: string,
  body: string,
): Promise<ConfigResult> {
  const template = templateFor(key);
  if (!template) return { ok: false, reason: "That is not a template." };

  if (typeof subject !== "string" || typeof body !== "string") {
    return { ok: false, reason: "A subject and a body are text." };
  }
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) {
    return { ok: false, reason: "That is longer than this API accepts." };
  }

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() =>
    updateAuthConfig(found.token, projectRef, {
      [template.subject]: subject,
      [template.body]: body,
    }),
  );

  await recordWrite({
    ref: projectRef,
    what: `${template.label} email template`,
    outcome: result.ok ? "saved" : `save failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/** The seven switches, saved together — they are one section of one screen. */
export async function saveNotifications(
  projectRef: string,
  flags: Record<string, boolean>,
): Promise<ConfigResult> {
  if (typeof flags !== "object" || flags === null) return { ok: false, reason: "Nothing to save." };

  const body: Record<string, boolean> = {};
  for (const [field, value] of Object.entries(flags)) {
    if (!isNotificationField(field)) return { ok: false, reason: "That is not a notification." };
    if (typeof value !== "boolean") return { ok: false, reason: "That setting is on or off." };
    body[field] = value;
  }

  if (Object.keys(body).length === 0) return { ok: false, reason: "Nothing to save." };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateAuthConfig(found.token, projectRef, body));

  await recordWrite({
    ref: projectRef,
    what: "auth email notifications",
    outcome: result.ok ? `saved ${Object.keys(body).length} switches` : `save failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * SMTP, including the password — which goes one way only.
 *
 * The PATCH body is built by `smtpPatchFrom` in `lib/auth-config.ts`, which is pure and tested,
 * because the two numeric-looking fields want opposite types: `smtp_port` a string and
 * `smtp_max_frequency` a number. Measured — and the first version of this sent both as numbers and
 * so never saved a port.
 *
 * `smtp_pass` comes back from the config as a 64-character stand-in when one is set, never as the
 * password; the part reduces it to a yes or no. The audit line records that SMTP changed rather than
 * what it changed to.
 */
export async function saveSmtp(
  projectRef: string,
  settings: Record<string, string>,
  password: string,
): Promise<ConfigResult> {
  if (typeof settings !== "object" || settings === null) return { ok: false, reason: "Nothing to save." };

  const built = smtpPatchFrom(settings, password);
  if (!built.ok) return built;

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateAuthConfig(found.token, projectRef, built.body));

  await recordWrite({
    ref: projectRef,
    what: "SMTP settings",
    // Never the values: this line is read by whoever holds the connection, and one of them is a
    // credential for somebody's mail server.
    outcome: result.ok
      ? `saved${built.body.smtp_pass ? ", including the password" : ""}`
      : `save failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Turning custom SMTP off, which there is no flag for — "on" is `smtp_host` being set.
 *
 * Measured on a scratch project: nulling every `smtp_*` field answers 200 and reads back null, with
 * `smtp_max_frequency` left at 60. The confirm in front of this is the only safety: the password is
 * write-only and cannot be shown again, and on a free project template edits are refused from the
 * moment this succeeds.
 */
export async function clearSmtp(projectRef: string): Promise<ConfigResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateAuthConfig(found.token, projectRef, { ...SMTP_CLEAR }));

  await recordWrite({
    ref: projectRef,
    what: "SMTP settings",
    outcome: result.ok ? "custom SMTP turned off" : `turning off failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * A template back to Supabase's own text.
 *
 * **There is no API for this, and the obvious ones are dangerous.** Measured: `""` answers 200 and
 * writes an *empty* subject and body — blank mail to every recipient — and `null` answers 400. What
 * works is writing the default text back: the server decides "customised" by comparing against it,
 * and the flag returned to false when the probe did exactly that. The text comes from
 * `lib/auth-template-defaults.ts`, read off a project that had customised nothing.
 */
export async function resetEmailTemplate(projectRef: string, key: string): Promise<ConfigResult> {
  const template = templateFor(key);
  if (!template) return { ok: false, reason: "That is not a template." };

  const subject = TEMPLATE_DEFAULTS[template.subject];
  const body = TEMPLATE_DEFAULTS[template.body];
  // Never write an empty template on the strength of a missing default.
  if (!subject || !body) return { ok: false, reason: "There is no default on record for that template." };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() =>
    updateAuthConfig(found.token, projectRef, { [template.subject]: subject, [template.body]: body }),
  );

  await recordWrite({
    ref: projectRef,
    what: `${template.label} email template`,
    outcome: result.ok ? "reset to the default" : `reset failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
