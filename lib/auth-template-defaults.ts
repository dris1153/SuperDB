/**
 * Supabase's default subject and body for every auth email template.
 *
 * **Read off a live project, not written from memory.** Captured 2026-09-26 from a project whose
 * `mailer_subjects_custom_contents` and `mailer_templates_custom_contents` were false throughout, so
 * every value below is the text Supabase itself serves when nobody has edited it.
 *
 * **Why this file exists at all.** There is no API for "back to the default": a PATCH of `""`
 * writes an empty template — measured, subject and body both became zero characters — and `null`
 * answers 400. What *does* work is writing the default text back: the server decides "customised" by
 * comparing against it, and the flag returned to false when the probe restored these exact strings.
 *
 * If Supabase changes a default, resetting writes the old one and the template reads as customised.
 * That is a visible, recoverable state; an empty template sent to real users is neither.
 */
export const TEMPLATE_DEFAULTS: Record<string, string> = {
  mailer_subjects_confirmation: "Confirm your email address",
  mailer_subjects_email_change: "Confirm your new email address",
  mailer_subjects_email_changed_notification: "Your email address was changed",
  mailer_subjects_identity_linked_notification: "A new sign-in method was linked to your account",
  mailer_subjects_identity_unlinked_notification: "A sign-in method was removed from your account",
  mailer_subjects_invite: "You've been invited",
  mailer_subjects_magic_link: "Your sign-in link",
  mailer_subjects_mfa_factor_enrolled_notification: "A new verification method was added to your account",
  mailer_subjects_mfa_factor_unenrolled_notification: "A verification method was removed from your account",
  mailer_subjects_password_changed_notification: "Your password was changed",
  mailer_subjects_phone_changed_notification: "Your phone number was changed",
  mailer_subjects_reauthentication: "{{ .Token }} is your verification code",
  mailer_subjects_recovery: "Reset your password",
  mailer_templates_confirmation_content: "<h2>Confirm your email address</h2>\n\n<p>Follow the link below to confirm this email address and finish signing up.</p>\n<p><a href=\"{{ .ConfirmationURL }}\">Confirm email address</a></p>",
  mailer_templates_email_change_content: "<h2>Confirm your new email address</h2>\n\n<p>Follow the link below to confirm {{ .NewEmail }} as your new email address.</p>\n<p><a href=\"{{ .ConfirmationURL }}\">Confirm new email address</a></p>\n\n<p>If you didn't request this change, you can safely ignore this email.</p>",
  mailer_templates_email_changed_notification_content: "<h2>Your email address was changed</h2>\n\n<p>The email address for your account was changed from {{ .OldEmail }} to {{ .Email }}.</p>\n\n<p>If you didn't make this change, contact support immediately.</p>",
  mailer_templates_identity_linked_notification_content: "<h2>A new sign-in method was linked</h2>\n\n<p>Your {{ .Provider }} account was linked as a new sign-in method for {{ .Email }}.</p>\n\n<p>If you didn't make this change, contact support immediately.</p>",
  mailer_templates_identity_unlinked_notification_content: "<h2>A sign-in method was removed</h2>\n\n<p>Your {{ .Provider }} account was removed as a sign-in method for {{ .Email }}.</p>\n\n<p>If you didn't make this change, contact support immediately.</p>",
  mailer_templates_invite_content: "<h2>You've been invited</h2>\n\n<p>You've been invited to create an account. Follow the link below to accept.</p>\n<p><a href=\"{{ .ConfirmationURL }}\">Accept invitation</a></p>",
  mailer_templates_magic_link_content: "<h2>Your sign-in link</h2>\n\n<p>Follow the link below to sign in. This link expires shortly and can only be used once.</p>\n<p><a href=\"{{ .ConfirmationURL }}\">Sign in</a></p>",
  mailer_templates_mfa_factor_enrolled_notification_content: "<h2>A new verification method was added</h2>\n\n<p>Sign-in verification method {{ .FactorType }} was added to your account.</p>\n\n<p>If you didn't make this change, contact support immediately.</p>",
  mailer_templates_mfa_factor_unenrolled_notification_content: "<h2>A verification method was removed</h2>\n\n<p>Sign-in verification method {{ .FactorType }} was removed from your account.</p>\n\n<p>If you didn't make this change, contact support immediately.</p>",
  mailer_templates_password_changed_notification_content: "<h2>Your password was changed</h2>\n\n<p>The password for your account was recently changed.</p>\n\n<p>If you didn't make this change, reset your password and contact support immediately.</p>",
  mailer_templates_phone_changed_notification_content: "<h2>Your phone number was changed</h2>\n\n<p>The phone number for your account was changed from {{ .OldPhone }} to {{ .Phone }}.</p>\n\n<p>If you didn't make this change, contact support immediately.</p>",
  mailer_templates_reauthentication_content: "<h2>Your verification code</h2>\n\n<p>Use the code below to verify your identity. It expires shortly.</p>\n\n<p>{{ .Token }}</p>",
  mailer_templates_recovery_content: "<h2>Reset your password</h2>\n\n<p>We received a request to reset your password. Follow the link below to choose a new one.</p>\n<p><a href=\"{{ .ConfirmationURL }}\">Reset password</a></p>\n\n<p>If you didn't request this, you can safely ignore this email.</p>",
};
