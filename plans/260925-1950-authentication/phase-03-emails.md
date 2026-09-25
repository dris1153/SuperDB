---
phase: 3
title: "Emails"
status: pending
priority: P2
effort: "6h"
dependencies: []
---

# Phase 3: Emails

## Overview

The six templates, the seven security notifications, and SMTP. All of it is `/config/auth`.

## Requirements

- Templates: subject and body for confirm signup, invite, magic link, change email, reset password,
  reauthentication.
- Security notifications: the seven toggles from the screenshot.
- SMTP Settings: the sender details and the provider settings, behind an enable switch.

## Architecture

**No project credential.** This phase is the Management API alone, which makes it independent of
phases 1 and 2 and buildable in any order.

The fields, measured:

```
mailer_subjects_confirmation / _invite / _magic_link / _email_change / _recovery / _reauthentication
mailer_templates_*_content                              the matching bodies
mailer_notifications_password_changed_enabled           and six more
smtp_admin_email, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_sender_name, smtp_max_frequency
```

`mailer_subjects_custom_contents` is a map of booleans saying which subjects have been customised —
what the dashboard uses to show a template as edited.

**PATCH merges by key at the top level**, measured on the storage config and the same API here. So
saving one template sends one field, not the other 242.

**The "set up custom SMTP to edit templates" banner is real.** Whether it is enforced for this
project is not something `/config/auth` reports, so the banner shows when `smtp_host` is null and the
save is attempted regardless — if the API refuses, its message is what gets shown.

## Related Code Files

- Create: `app/(app)/p/[ref]/auth/emails/page.tsx`
- Create: `components/auth/email-templates.tsx`, `email-template-editor.tsx`, `smtp-settings.tsx`
- Create: `lib/auth-config.ts` (+ test) — the template catalogue and the field names
- Create: `lib/auth-config-actions.ts`

## Implementation Steps

1. `lib/auth-config.ts`: one entry per template naming its subject field, its body field and its
   label. Pure and tested — a wrong field name here saves a subject into the wrong email.
2. A part reading `/config/auth`, picking only the fields these screens use out of the 243.
3. The template list, with a row per template.
4. The editor: subject, body as source with a preview, and the SMTP banner when `smtp_host` is null.
5. The seven notification switches, saved together.
6. SMTP settings, with the password write-only — the API does not return it.

## Success Criteria

- [ ] Each template's subject and body load and save.
- [ ] The seven switches reflect the project and save.
- [ ] SMTP settings save, and the password field never shows a stored value.
- [ ] Saving one thing does not clear another.

## Risk Assessment

- **`smtp_pass` is a credential going the other way.** It is written, never read back, and never
  logged — the audit line records that SMTP changed, not what it changed to.
- **243 fields, and this page shows about 25.** The part picks; a pass-through would ship every OAuth
  provider secret in the project to the browser.
