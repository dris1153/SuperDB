# Authentication emails

The Emails pages — the template list, one page per template, and SMTP — and the mail-sending actions
on a user. Part of [Authentication](./authentication.md); split out because everything here is about
one config endpoint that behaves in ways its shape does not suggest.

Modules: [`lib/auth-config.ts`](../lib/auth-config.ts) (the catalogue, the SMTP body builder),
[`lib/auth-template-defaults.ts`](../lib/auth-template-defaults.ts),
[`lib/auth-config-actions.ts`](../lib/auth-config-actions.ts), and the screens in
[`components/auth/`](../components/auth/) — `emails-page`, `template-lists`, `template-editor`,
`html-editor`, `smtp-settings`.

## `/config/auth`, and what it does with a save

`/config/auth` returns 243 fields. This page shows about twenty-five, and the part picks rather than
passes through — the rest carries every configured OAuth provider's client secret.

**PATCH merges by key**, so each save sends only what it changed. Three things about that endpoint
are worth knowing before touching it:

- **A refusal is not always a no-op.** A PATCH carrying a template field *and* a notification field
  answered 400 for the template and **applied the notification anyway**. Each action here saves one
  kind of field, so a reported failure means that kind did not land.
- **An unknown field is accepted and ignored.** `{superdb_not_a_field: true}` answers 200. Nothing
  upstream catches a typo, which is why `lib/auth-config.ts` is a catalogue and field names are
  never taken from the caller.
- **Template editing is gated by plan.** On a free project using the default mail provider, a PATCH
  to any template field answers `400 "Email template modification is not available for free tier
  projects using the default email provider."` `/config/auth` does not report which plan a project
  is on, so the save is attempted and the API's own sentence is what shows.

`smtp_pass` goes one way: never in a part, and never in the audit line — which records that SMTP
changed, not what it changed to. An empty password box means "leave it", not "clear it".

**What the config returns for it is not the password.** Measured 2026-09-26: a project with one set
answers with a 64-character value (19 characters were sent), and a project without answers `null`.
So whether a password is stored is knowable — the part reduces it to `hasSmtpPassword` on the server
— while the value itself is a stand-in that never leaves `pickEmailConfig`.

**The two numeric-looking SMTP fields want opposite types**, and the first version of the save got
one of them wrong for its whole life:

```
smtp_port           "587"  200      587  400 "expected string, received number"
smtp_max_frequency   60    200     "60"  400 "expected number, received string"
```

`smtpPatchFrom` in `lib/auth-config.ts` builds the body and a test pins both types.

**There is no enabled flag for custom SMTP.** "On" is `smtp_host` being set. Turning it off means
nulling the provider fields — measured: 200, all read back null, `smtp_max_frequency` left at 60.

## Resetting a template

**There is no API for "back to the default", and the obvious candidates are dangerous:**

```
PATCH {subject: "", body: ""}      200 — and the template is now empty: blank mail to every user
PATCH {subject: null, body: null}  400 "failed to update Auth config"
```

What works is writing Supabase's default text back. The server decides "customised" by comparing
against its own default: when the probe wrote the exact default strings, both
`mailer_*_custom_contents` flags returned to false. The defaults live in
`lib/auth-template-defaults.ts`, read off a project that had customised nothing — if Supabase ever
changes one, a reset writes the old text and the template reads as customised, which is visible and
recoverable where an empty template is neither.

## Template variables

From Supabase's documentation — the Terminology table in `auth-email-templates.mdx` — which scopes
the specialised ones exactly: `NewEmail` only in Change email address, `OldEmail` only in Email
address changed, `Phone`/`OldPhone` only in Phone number changed, `Provider` only in the two sign-in
method notifications, `FactorType` only in the two MFA ones.

The docs do not say whether `ConfirmationURL`, `Token`, `TokenHash` and `RedirectTo` are filled in a
*notification*, which has no flow to confirm. They are left off those templates, marked in the code
as inference: a missing chip costs a lookup, a chip that renders empty costs every recipient. A test
cross-checks the catalogue against Supabase's own default templates, which use only variables in
scope.

The seven security notifications each also have a subject and a body of their own
(`mailer_subjects_password_changed_notification` and friends). This page toggles them; editing those
bodies is a later addition.

## Sending mail

`POST /admin/generate_link {type, email}` mints a link **and sends the mail** — the call came back
with `recovery_sent_at` set on the user. `invite` creates the user as well.

**It does not spend the project's hourly allowance.** `rate_limit_email_sent` was 2 on the measured
project, and the page was designed around warning about that — then nine consecutive sends all
answered 200. The limit governs user-initiated mail; the admin endpoint is not what it guards. The
buttons therefore say what is true: the mail goes out at once, cannot be recalled, and nothing here
limits how many. The 429 branch stays for projects configured differently.
