---
title: "Emails, against the original: three screens where there was one"
status: in-progress
created: 2026-09-26
blockedBy: []
blocks: []
---

# Emails, against the original: three screens where there was one

The page built in [260925-1950-authentication phase 3](../260925-1950-authentication/phase-03-emails.md)
puts everything on one long scroll — six template tabs with an inline editor, seven switches, the
SMTP form. The original splits that into three:

1. **Templates** — two card lists. *Authentication*: six rows, each opening an editor. *Security*:
   seven rows, each with a switch *and* an editor, and one Save for the card.
2. **A page per template** — breadcrumb, subject, a body with Source and Preview, a code editor with
   line numbers, the template's variables as chips, Reset and Save.
3. **SMTP Settings** — an enable switch, then sender details and provider settings in two columns,
   each field with its help text.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The shell and the template lists](phase-01-lists.md) | **in-progress** | ~3h | — |
| 2 | [A page per template](phase-02-editor.md) | **in-progress** | ~5h | 1 |
| 3 | [SMTP Settings](phase-03-smtp.md) | **in-progress** | ~3h | 1 |

## What is already known

- **Thirteen templates, not six.** The seven security notifications have subjects and bodies of their
  own — `mailer_subjects_password_changed_notification` and the rest, read off a live `/config/auth`
  on 2026-09-26. The original's chevrons on those rows are editors, and this page never had them.
- **Template edits are refused on a free project using the default provider** — measured, `400
  "Email template modification is not available for free tier projects…"`. The project this page is
  most used against has custom SMTP (Resend), so it edits; others will show that sentence.
- **PATCH merges by key, can refuse one field and apply another, and ignores unknown fields.** All
  measured; see `docs/authentication.md`. Each save still sends one kind of field.
- **CodeMirror is already a dependency** and `components/sql-editor/editor-theme.ts` is a theme built
  from this app's tokens. The body editor reuses it.

## Settled decisions

- **Turning custom SMTP off clears it, behind a confirm.** `/config/auth` has no enabled flag —
  "enabled" is only `smtp_host` being set — so off means nulling the `smtp_*` fields. The confirm says
  what that costs: `smtp_pass` is write-only, so it cannot be shown again, and on a free project
  template edits are refused again from that moment.
- **`@codemirror/lang-html` is added** for full HTML colouring in the body. A new dependency, chosen
  over colouring only the `{{ }}` tags.
- **A variable chip inserts at the cursor** of whichever field — subject or body — was focused last.
  That is what the original's sentence says they are for.
- **The tab lives in the URL** (`?tab=smtp`), so a reload or a shared link lands where it was.

## Gates — measured or researched before building, and able to remove a control

1. **How a template goes back to its default.** Unmeasured: an empty string, `null`, or nothing at
   all. If the API cannot revert one, **Reset template does not ship** — a reset that writes an empty
   subject would send users blank mail.
2. **What turning SMTP off does to the rest.** Measured on a scratch project, never on the one with
   working SMTP.
3. **Which variables each template has.** From Supabase's documentation, not written from memory —
   reauthentication does not have a confirmation URL, and offering one would put a dead link in mail.

## Risks

- **This is the page that sends mail to real people.** A template saved blank, or an SMTP config
  cleared by a stray switch, fails silently from here and loudly in somebody's inbox.
