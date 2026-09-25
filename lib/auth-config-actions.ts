"use server";

import { resolveProject } from "./inventory";
import { updateAuthConfig } from "./mgmt-api";
import { attempt } from "./safe";
import { isNotificationField, templateFor, SMTP_FIELDS } from "./auth-config";
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
 * `smtp_pass` is written and never read back: the config returns it as null, the part does not ask
 * for it, and the audit line below records that SMTP changed rather than what it changed to. An
 * empty password field means "leave it as it is", not "clear it" — clearing a working SMTP password
 * by tabbing past a blank box is not a mistake worth making available.
 */
export async function saveSmtp(
  projectRef: string,
  settings: Record<string, string>,
  password: string,
): Promise<ConfigResult> {
  if (typeof settings !== "object" || settings === null) return { ok: false, reason: "Nothing to save." };

  const body: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(settings)) {
    if (!(SMTP_FIELDS as readonly string[]).includes(field)) {
      return { ok: false, reason: "That is not an SMTP setting." };
    }
    if (typeof value !== "string" || value.length > 500) {
      return { ok: false, reason: "That value is not text." };
    }

    // The two numeric ones, sent as numbers or not at all: the API rejects a string port, and an
    // empty box means "unset" rather than zero.
    if (field === "smtp_port" || field === "smtp_max_frequency") {
      if (value.trim() === "") {
        body[field] = null;
        continue;
      }
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return { ok: false, reason: `${field} is a whole number.` };
      body[field] = n;
      continue;
    }

    body[field] = value.trim() === "" ? null : value.trim();
  }

  if (typeof password === "string" && password !== "") body.smtp_pass = password;

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateAuthConfig(found.token, projectRef, body));

  await recordWrite({
    ref: projectRef,
    what: "SMTP settings",
    // Never the values: this line is read by whoever holds the connection, and one of them is a
    // credential for somebody's mail server.
    outcome: result.ok
      ? `saved${body.smtp_pass ? ", including the password" : ""}`
      : `save failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
