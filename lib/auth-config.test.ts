import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  NOTIFICATIONS,
  SMTP_FIELDS,
  TEMPLATES,
  isNotificationField,
  pickEmailConfig,
  templateFor,
} from "./auth-config.ts";

test("every template names a distinct subject and body field", () => {
  const fields = TEMPLATES.flatMap((t) => [t.subject, t.body]);
  assert.equal(new Set(fields).size, fields.length, "a duplicate saves into the wrong email");

  for (const t of TEMPLATES) {
    assert.ok(t.subject.startsWith("mailer_subjects_"), t.subject);
    assert.ok(t.body.startsWith("mailer_templates_"), t.body);
    assert.ok(t.body.endsWith("_content"), t.body);
  }
});

test("a template is looked up by key, and an unknown key is not one", () => {
  assert.equal(templateFor("recovery")?.subject, "mailer_subjects_recovery");
  assert.equal(templateFor("nonsense"), null);
  // The lookup is what stands between a "use server" caller and naming any field in the config.
  assert.equal(templateFor("external_google_secret"), null);
});

test("only the seven notification fields are writable", () => {
  for (const n of NOTIFICATIONS) assert.equal(isNotificationField(n.field), true);
  assert.equal(NOTIFICATIONS.length, 7);
  assert.equal(isNotificationField("mailer_autoconfirm"), false);
  assert.equal(isNotificationField("external_google_secret"), false);
  assert.equal(isNotificationField(null), false);
});

test("the SMTP password is not a field this app reads", () => {
  // It is written by `saveSmtp` and never read back. Listing it here would put it in the part, and
  // the part answers a browser.
  assert.ok(!(SMTP_FIELDS as readonly string[]).includes("smtp_pass"));
});

test("the config is picked down to the page, not passed through", () => {
  const picked = pickEmailConfig({
    mailer_subjects_recovery: "Reset your password",
    mailer_templates_recovery_content: "<h2>Reset</h2>",
    mailer_subjects_custom_contents: { MAILER_SUBJECTS_RECOVERY: true },
    mailer_notifications_password_changed_enabled: true,
    smtp_host: "smtp.example.com",
    smtp_port: 587,
    smtp_pass: "hunter2",
    rate_limit_email_sent: 2,
    external_google_secret: "a client secret",
  });

  assert.equal(picked.templates.recovery.subject, "Reset your password");
  assert.equal(picked.templates.recovery.customised, true);
  assert.equal(picked.templates.invite.customised, false, "untouched templates are not edited");
  assert.equal(picked.notifications.mailer_notifications_password_changed_enabled, true);
  assert.equal(picked.notifications.mailer_notifications_email_changed_enabled, false);
  assert.equal(picked.smtp.smtp_port, "587", "numbers reach the form as text");
  assert.equal(picked.smtpHost, "smtp.example.com");
  assert.equal(picked.rateLimitEmailSent, 2);

  // The point of picking: 243 fields arrive and the rest hold every OAuth provider's secret.
  const serialised = JSON.stringify(picked);
  assert.ok(!serialised.includes("a client secret"));
  assert.ok(!serialised.includes("hunter2"));
});

test("an absent field reads as empty rather than as the string 'undefined'", () => {
  const picked = pickEmailConfig({});

  assert.equal(picked.templates.confirmation.subject, "");
  assert.equal(picked.smtp.smtp_host, "");
  assert.equal(picked.smtpHost, null, "which is what the banner keys on");
  assert.equal(picked.rateLimitEmailSent, null);
});
