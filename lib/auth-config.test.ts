import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  NOTIFICATIONS,
  SMTP_CLEAR,
  SMTP_FIELDS,
  TEMPLATES,
  isNotificationField,
  pickEmailConfig,
  smtpPatchFrom,
  templateFor,
} from "./auth-config.ts";
import { TEMPLATE_DEFAULTS } from "./auth-template-defaults.ts";

test("every template field exists on a live config", () => {
  // TEMPLATE_DEFAULTS was read off a real `/config/auth`, so it is the list of fields that exist.
  // The API accepts an unknown field silently — a typo here would save into nothing, and this is
  // the only thing that would notice.
  for (const t of TEMPLATES) {
    assert.ok(t.subject in TEMPLATE_DEFAULTS, t.subject);
    assert.ok(t.body in TEMPLATE_DEFAULTS, t.body);
  }
  assert.equal(TEMPLATES.length, 13);
  assert.equal(Object.keys(TEMPLATE_DEFAULTS).length, 26, "every default has a template");
});

test("every template names two distinct fields", () => {
  const fields = TEMPLATES.flatMap((t) => [t.subject, t.body]);
  assert.equal(new Set(fields).size, fields.length, "a duplicate saves into the wrong email");
  assert.equal(new Set(TEMPLATES.map((t) => t.key)).size, TEMPLATES.length);
});

test("the security templates are the ones with a switch, and only they are", () => {
  for (const t of TEMPLATES) {
    assert.equal(t.group === "security", t.toggle !== undefined, t.key);
    if (t.toggle) assert.match(t.toggle, /^mailer_notifications_.+_enabled$/);
  }
  assert.equal(NOTIFICATIONS.length, 7);
});

test("a template is looked up by key, and nothing else is one", () => {
  assert.equal(templateFor("recovery")?.subject, "mailer_subjects_recovery");
  assert.equal(templateFor("password_changed")?.body, "mailer_templates_password_changed_notification_content");
  // The route segment reaches this lookup; it is what stands between a URL and a field name.
  for (const bad of ["nonsense", "external_google_secret", "", "mailer_subjects_recovery"]) {
    assert.equal(templateFor(bad), null, bad);
  }
});

test("only the seven notification switches are writable as switches", () => {
  for (const n of NOTIFICATIONS) assert.equal(isNotificationField(n.field), true);
  assert.equal(isNotificationField("mailer_autoconfirm"), false);
  assert.equal(isNotificationField("external_google_secret"), false);
});

test("variables follow the documented scope", () => {
  const vars = (key: string) => templateFor(key)?.variables ?? [];

  // Only where the docs say they are filled.
  assert.ok(vars("email_change").includes("NewEmail"));
  assert.ok(!vars("confirmation").includes("NewEmail"));
  assert.ok(vars("email_changed").includes("OldEmail"));
  assert.ok(vars("phone_changed").includes("OldPhone"));
  assert.ok(vars("identity_linked").includes("Provider"));
  assert.ok(vars("mfa_factor_unenrolled").includes("FactorType"));

  // The inference, pinned so it is changed on purpose: no action variables in a notification.
  for (const t of TEMPLATES.filter((t) => t.group === "security")) {
    assert.ok(!t.variables.includes("ConfirmationURL"), t.key);
    assert.ok(!t.variables.includes("Token"), t.key);
  }
});

test("the defaults use only the variables their template offers", () => {
  // A cross-check between two independent sources: the docs' scope and Supabase's own templates.
  for (const t of TEMPLATES) {
    const text = TEMPLATE_DEFAULTS[t.subject] + TEMPLATE_DEFAULTS[t.body];
    for (const used of text.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)) {
      assert.ok(t.variables.includes(used[1]), `${t.key} uses ${used[1]}`);
    }
  }
});

test("the port goes as a string and the interval as a number", () => {
  // Measured: smtp_port 587 -> 400 "expected string"; smtp_max_frequency "60" -> 400 "expected
  // number". The first version sent both as numbers and so never saved a port.
  const built = smtpPatchFrom({ smtp_port: " 465 ", smtp_max_frequency: "60" }, "");
  assert.equal(built.ok, true);
  assert.deepEqual(built.ok && built.body, { smtp_port: "465", smtp_max_frequency: 60 });
});

test("a blank password is left out, not sent as empty", () => {
  // Tabbing past an empty box must not clear a working credential.
  const built = smtpPatchFrom({ smtp_host: "smtp.example.com" }, "");
  assert.ok(built.ok && !("smtp_pass" in built.body));

  const withPass = smtpPatchFrom({}, "secret");
  assert.ok(withPass.ok && withPass.body.smtp_pass === "secret");
});

test("empty fields are unset, except the interval, which is left alone", () => {
  const built = smtpPatchFrom({ smtp_host: "  ", smtp_port: "", smtp_max_frequency: "" }, "");
  assert.deepEqual(built.ok && built.body, { smtp_host: null, smtp_port: null });
});

test("bad SMTP input is refused before it reaches the API", () => {
  assert.equal(smtpPatchFrom({ smtp_port: "99999" }, "").ok, false);
  assert.equal(smtpPatchFrom({ smtp_port: "abc" }, "").ok, false);
  assert.equal(smtpPatchFrom({ smtp_max_frequency: "-1" }, "").ok, false);
  assert.equal(smtpPatchFrom({ external_google_secret: "x" }, "").ok, false);
  assert.equal(smtpPatchFrom({ smtp_host: 42 as unknown as string }, "").ok, false);
});

test("clearing SMTP nulls the provider and leaves the rate limit", () => {
  for (const field of ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_admin_email", "smtp_sender_name"]) {
    assert.equal((SMTP_CLEAR as Record<string, null>)[field], null, field);
  }
  assert.ok(!("smtp_max_frequency" in SMTP_CLEAR));
});

test("the config is picked down to the page, and the password to a yes or no", () => {
  const picked = pickEmailConfig({
    mailer_subjects_recovery: "Reset your password",
    mailer_templates_recovery_content: "<h2>Reset</h2>",
    mailer_subjects_custom_contents: { MAILER_SUBJECTS_RECOVERY: true },
    mailer_notifications_password_changed_enabled: true,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_pass: "x".repeat(64),
    rate_limit_email_sent: 2,
    external_google_secret: "a client secret",
  });

  assert.equal(picked.templates.recovery.subject, "Reset your password");
  assert.equal(picked.templates.recovery.customised, true);
  assert.equal(picked.templates.invite.customised, false);
  assert.equal(picked.notifications.mailer_notifications_password_changed_enabled, true);
  assert.equal(picked.smtp.smtp_port, "465");
  assert.equal(picked.smtpHost, "smtp.resend.com");
  assert.equal(picked.hasSmtpPassword, true);

  // The point of picking: 243 fields arrive, one is a password stand-in and many are secrets.
  const serialised = JSON.stringify(picked);
  assert.ok(!serialised.includes("a client secret"));
  assert.ok(!serialised.includes("x".repeat(64)));
  assert.ok(!(SMTP_FIELDS as readonly string[]).includes("smtp_pass"));
});

test("no stored password reads as no, not as an empty string", () => {
  assert.equal(pickEmailConfig({ smtp_pass: null }).hasSmtpPassword, false);
  assert.equal(pickEmailConfig({}).hasSmtpPassword, false);
  assert.equal(pickEmailConfig({}).smtpHost, null);
});
