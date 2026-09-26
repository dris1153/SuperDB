/**
 * The slice of `/config/auth` the Emails pages read and write.
 *
 * 243 fields arrive; about forty are here. The part picks from this catalogue rather than passing
 * the response through, because the rest of it holds every configured OAuth provider's client secret
 * — and `smtp_pass`, which comes back as a 64-character value when one is set, never as the password
 * that was sent (measured: 19 characters in, 64 out).
 *
 * Every field name below was read off a live `/config/auth` on 2026-09-26, not remembered: a wrong
 * one would save a subject into a different email, and the API accepts unknown fields silently.
 */
export type TemplateGroup = "authentication" | "security";

type Template = {
  key: string;
  label: string;
  /** The original's own sentence for the row. */
  description: string;
  group: TemplateGroup;
  subject: string;
  body: string;
  /** The switch that sends it at all — security notifications only. */
  toggle?: string;
  /** What `{{ … }}` this template can use. See VARIABLES below for where each list comes from. */
  variables: readonly string[];
};

/**
 * Template variables, from Supabase's documentation — `auth-email-templates.mdx`, the Terminology
 * table, read 2026-09-26.
 *
 * The docs name the scope of the specialised ones exactly: `NewEmail` only in Change email address,
 * `OldEmail` only in Email address changed, `Phone` and `OldPhone` only in Phone number changed,
 * `Provider` only in the two sign-in method notifications, `FactorType` only in the two MFA ones.
 *
 * **One part is inference, and marked as such.** The docs do not say whether the four action
 * variables — `ConfirmationURL`, `Token`, `TokenHash`, `RedirectTo` — are filled in a *notification*,
 * which has no flow to confirm. They are left off the security templates: a chip that is missing
 * costs somebody a lookup, and a chip that renders empty costs every recipient a broken email.
 */
const FLOW = ["ConfirmationURL", "Token", "TokenHash", "SiteURL", "Email", "Data", "RedirectTo"] as const;
const NOTICE = ["Email", "SiteURL", "Data"] as const;

const flow = (
  key: string,
  label: string,
  description: string,
  extra: readonly string[] = [],
): Template => ({
  key,
  label,
  description,
  group: "authentication",
  subject: `mailer_subjects_${key}`,
  body: `mailer_templates_${key}_content`,
  variables: [...FLOW, ...extra],
});

const notice = (
  key: string,
  label: string,
  description: string,
  extra: readonly string[] = [],
): Template => ({
  key,
  label,
  description,
  group: "security",
  subject: `mailer_subjects_${key}_notification`,
  body: `mailer_templates_${key}_notification_content`,
  toggle: `mailer_notifications_${key}_enabled`,
  variables: [...NOTICE, ...extra],
});

export const TEMPLATES: readonly Template[] = [
  flow("confirmation", "Confirm sign up", "Ask users to confirm their email address after signing up"),
  flow("invite", "Invite user", "Invite someone to create an account"),
  flow("magic_link", "Magic link or OTP", "Send a one-time sign-in link or one-time password"),
  flow(
    "email_change",
    "Change email address",
    "Ask users to verify their new email address after changing it",
    ["NewEmail"],
  ),
  flow("recovery", "Reset password", "Send a password reset link or code"),
  flow(
    "reauthentication",
    "Reauthentication",
    "Ask users to verify their identity before a sensitive operation",
  ),

  notice("password_changed", "Password changed", "Notify users when their password has changed"),
  notice(
    "email_changed",
    "Email address changed",
    "Notify users when their email address has changed",
    ["OldEmail"],
  ),
  notice(
    "phone_changed",
    "Phone number changed",
    "Notify users when their phone number has changed",
    ["Phone", "OldPhone"],
  ),
  notice(
    "identity_linked",
    "Sign-in method linked",
    "Notify users when a sign-in method has been linked to their account",
    ["Provider"],
  ),
  notice(
    "identity_unlinked",
    "Sign-in method removed",
    "Notify users when a sign-in method has been removed from their account",
    ["Provider"],
  ),
  notice(
    "mfa_factor_enrolled",
    "MFA method added",
    "Notify users when an MFA method has been added to their account",
    ["FactorType"],
  ),
  notice(
    "mfa_factor_unenrolled",
    "MFA method removed",
    "Notify users when an MFA method has been removed from their account",
    ["FactorType"],
  ),
];

export type TemplateKey = (typeof TEMPLATES)[number]["key"];

export const templateFor = (key: string) => TEMPLATES.find((t) => t.key === key) ?? null;

/** The seven switches, derived from the catalogue so the list and the templates cannot disagree. */
export const NOTIFICATIONS = TEMPLATES.filter((t) => t.toggle).map((t) => ({
  field: t.toggle as string,
  label: t.label,
}));

export const isNotificationField = (value: unknown): value is string =>
  NOTIFICATIONS.some((n) => n.field === value);

/** Written, never read back as the password. `smtp_pass` is deliberately not among them. */
export const SMTP_FIELDS = [
  "smtp_admin_email",
  "smtp_sender_name",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_max_frequency",
] as const;

export type SmtpField = (typeof SMTP_FIELDS)[number];

export type EmailConfig = {
  templates: Record<string, { subject: string; body: string; customised: boolean }>;
  notifications: Record<string, boolean>;
  smtp: Record<string, string>;
  /** Null when the project is on Supabase's shared sender — which is also what "custom SMTP off" means. */
  smtpHost: string | null;
  /**
   * Whether a password is stored. Derived here, on the server, from `smtp_pass` being non-null —
   * the value itself is a 64-character stand-in and never leaves this function.
   */
  hasSmtpPassword: boolean;
  rateLimitEmailSent: number | null;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * The response, reduced to what these screens show.
 *
 * `mailer_subjects_custom_contents` and its template twin are maps keyed by the field name in upper
 * case, saying which differ from the default — the server compares against its own default text, so
 * writing the default back turns the flag off again (measured).
 */
export function pickEmailConfig(raw: Record<string, unknown>): EmailConfig {
  const customSubjects = (raw.mailer_subjects_custom_contents ?? {}) as Record<string, unknown>;
  const customBodies = (raw.mailer_templates_custom_contents ?? {}) as Record<string, unknown>;

  const templates: EmailConfig["templates"] = {};
  for (const t of TEMPLATES) {
    templates[t.key] = {
      subject: text(raw[t.subject]),
      body: text(raw[t.body]),
      customised:
        customSubjects[t.subject.toUpperCase()] === true ||
        customBodies[t.body.toUpperCase()] === true,
    };
  }

  const notifications: Record<string, boolean> = {};
  for (const n of NOTIFICATIONS) notifications[n.field] = raw[n.field] === true;

  const smtp: Record<string, string> = {};
  for (const field of SMTP_FIELDS) {
    const value = raw[field];
    smtp[field] = value === null || value === undefined ? "" : String(value);
  }

  const limit = Number(raw.rate_limit_email_sent);

  return {
    templates,
    notifications,
    smtp,
    smtpHost: typeof raw.smtp_host === "string" && raw.smtp_host ? raw.smtp_host : null,
    hasSmtpPassword: raw.smtp_pass !== null && raw.smtp_pass !== undefined && raw.smtp_pass !== "",
    rateLimitEmailSent: Number.isFinite(limit) ? limit : null,
  };
}

/**
 * The PATCH body for an SMTP save, or the reason there is not one.
 *
 * **The two numeric-looking fields want opposite types**, measured 2026-09-26 against the API:
 *
 * ```
 * smtp_port           "587"  200      587  400 "expected string, received number"
 * smtp_max_frequency   60    200     "60"  400 "expected number, received string"
 * ```
 *
 * The first version of this sent both as numbers, so it never saved a port. Pure, so the types are
 * held by a test rather than by whoever next touches the form.
 *
 * An empty field is `null` — unset — rather than an empty string, except the password, which is
 * left out entirely when blank: tabbing past an empty box must not clear a working credential.
 */
export function smtpPatchFrom(
  settings: Record<string, unknown>,
  password: unknown,
): { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  const body: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(settings)) {
    if (!(SMTP_FIELDS as readonly string[]).includes(field)) {
      return { ok: false, reason: "That is not an SMTP setting." };
    }
    if (typeof value !== "string" || value.length > 500) {
      return { ok: false, reason: "That value is not text." };
    }

    const trimmed = value.trim();

    if (field === "smtp_port") {
      if (trimmed === "") {
        body[field] = null;
        continue;
      }
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return { ok: false, reason: "A port is 1 to 65535." };
      body[field] = String(n);
      continue;
    }

    if (field === "smtp_max_frequency") {
      if (trimmed === "") continue; // leave the server's value alone rather than unset a rate limit
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) return { ok: false, reason: "The interval is a whole number of seconds." };
      body[field] = n;
      continue;
    }

    body[field] = trimmed === "" ? null : trimmed;
  }

  if (typeof password === "string" && password !== "") body.smtp_pass = password;

  return { ok: true, body };
}

/**
 * Turning custom SMTP off: every field that makes it "on", nulled.
 *
 * `smtp_max_frequency` is left alone — it came back as 60 after the clear in the measurement, and it
 * is a rate limit rather than part of the provider's identity.
 */
export const SMTP_CLEAR = {
  smtp_host: null,
  smtp_port: null,
  smtp_user: null,
  smtp_pass: null,
  smtp_admin_email: null,
  smtp_sender_name: null,
} as const;
