---
phase: 3
title: "Emails"
status: completed
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

**The "set up custom SMTP to edit templates" banner is real, and it is enforced.** Measured
2026-09-26 — this was a guess when the phase was written:

```
PATCH {mailer_subjects_recovery: "…", mailer_templates_recovery_content: "…"}
  400 "Email template modification is not available for free tier projects using the default
       email provider. Please upgrade your plan or configure a custom SMTP provider."
```

`/config/auth` still does not say which plan the project is on, so the save is attempted regardless
and the API's own sentence is what shows.

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

- [x] Each template's subject and body load and save.
- [x] The seven switches reflect the project and save.
- [x] SMTP settings save, and the password field never shows a stored value.
- [x] Saving one thing does not clear another.

## Risk Assessment

- **`smtp_pass` is a credential going the other way.** It is written, never read back, and never
  logged — the audit line records that SMTP changed, not what it changed to.
- **243 fields, and this page shows about 25.** The part picks; a pass-through would ship every OAuth
  provider secret in the project to the browser.

## Measured while building, 2026-09-26

- **PATCH merges by key**, confirmed on this endpoint rather than assumed from `config/storage`:
  after saving one switch the field count was unchanged at 243 and every other subject was
  untouched.
- **A refusal is not always a no-op.** A PATCH carrying a template field *and* a notification field
  answered 400 for the template and **applied the notification anyway**. Each action here therefore
  saves one kind of field, so that a reported failure means that kind did not land.
- **An unknown field is accepted and ignored**: `{superdb_not_a_field: true}` answers 200. Nothing
  upstream catches a typo, which is the whole reason `lib/auth-config.ts` is a catalogue and the
  field names are never taken from the caller.
- **The seven notification templates have subjects and bodies too**
  (`mailer_subjects_password_changed_notification` and friends). This page edits the six flow
  templates and toggles the seven notifications, as the screenshot does; editing the notification
  bodies is a later addition if anyone wants it.
- Every field written during the measurement was restored, and the project ended where it started.

**Not verified:** that a template save succeeds anywhere. This project cannot accept one, so the
success path of the editor has been exercised only against a 400. Saving a notification switch and
reading it back did work end to end.
