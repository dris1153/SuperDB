/**
 * The slice of `/config/auth` the Emails page reads and writes.
 *
 * 243 fields arrive; about twenty-five are here. The part picks from this catalogue rather than
 * passing the response through, because the rest of it holds every configured OAuth provider's
 * client secret.
 *
 * Every field name below was read off a live `/config/auth` on 2026-09-26, not remembered: a wrong
 * one would save a subject into a different email and the API would accept it.
 */
export const TEMPLATES = [
  {
    key: "confirmation",
    label: "Confirm signup",
    subject: "mailer_subjects_confirmation",
    body: "mailer_templates_confirmation_content",
  },
  {
    key: "invite",
    label: "Invite user",
    subject: "mailer_subjects_invite",
    body: "mailer_templates_invite_content",
  },
  {
    key: "magic_link",
    label: "Magic link",
    subject: "mailer_subjects_magic_link",
    body: "mailer_templates_magic_link_content",
  },
  {
    key: "email_change",
    label: "Change email address",
    subject: "mailer_subjects_email_change",
    body: "mailer_templates_email_change_content",
  },
  {
    key: "recovery",
    label: "Reset password",
    subject: "mailer_subjects_recovery",
    body: "mailer_templates_recovery_content",
  },
  {
    key: "reauthentication",
    label: "Reauthentication",
    subject: "mailer_subjects_reauthentication",
    body: "mailer_templates_reauthentication_content",
  },
] as const;

export type TemplateKey = (typeof TEMPLATES)[number]["key"];

export const templateFor = (key: string) => TEMPLATES.find((t) => t.key === key) ?? null;

/**
 * The seven security notifications, each a switch.
 *
 * Each also has a subject and a body of its own — `mailer_subjects_password_changed_notification`
 * and the rest — which this page does not edit. The switches are what the screenshot offers.
 */
export const NOTIFICATIONS = [
  { field: "mailer_notifications_password_changed_enabled", label: "Password changed" },
  { field: "mailer_notifications_email_changed_enabled", label: "Email address changed" },
  { field: "mailer_notifications_phone_changed_enabled", label: "Phone number changed" },
  { field: "mailer_notifications_identity_linked_enabled", label: "Sign-in method linked" },
  { field: "mailer_notifications_identity_unlinked_enabled", label: "Sign-in method removed" },
  { field: "mailer_notifications_mfa_factor_enrolled_enabled", label: "Verification method added" },
  {
    field: "mailer_notifications_mfa_factor_unenrolled_enabled",
    label: "Verification method removed",
  },
] as const;

export type NotificationField = (typeof NOTIFICATIONS)[number]["field"];

export const isNotificationField = (value: unknown): value is NotificationField =>
  NOTIFICATIONS.some((n) => n.field === value);

/** Written, never read back. `smtp_pass` is deliberately not among them. */
export const SMTP_FIELDS = [
  "smtp_admin_email",
  "smtp_sender_name",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_max_frequency",
] as const;

export type EmailConfig = {
  templates: Record<string, { subject: string; body: string; customised: boolean }>;
  notifications: Record<string, boolean>;
  smtp: Record<string, string>;
  /** Null when the project is on Supabase's shared sender, which is what the banner keys on. */
  smtpHost: string | null;
  rateLimitEmailSent: number | null;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * The response, reduced to what these screens show.
 *
 * `mailer_subjects_custom_contents` and its template twin are maps keyed by the field name in upper
 * case, saying which have been edited away from the default — the "Customised" badge in the list.
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
    rateLimitEmailSent: Number.isFinite(limit) ? limit : null,
  };
}
