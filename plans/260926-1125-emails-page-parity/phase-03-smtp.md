---
phase: 3
title: "SMTP Settings"
status: in-progress  # built; not looked at in a browser
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 3: SMTP Settings

## Overview

The SMTP form as the original lays it out, with an enable switch that does what it says.

## Requirements

- An `Enable custom SMTP` row with its sentence and a switch.
- *Sender details*: sender email address, sender name — label and description on the left, fields
  and help text on the right.
- *SMTP provider settings*: host, port, minimum interval per user (with a `seconds` suffix),
  username, password — same two-column shape.
- The password field shows that one is stored without showing it: "Stored password is hidden. Enter a
  new password to replace it."
- One `Save changes`.

## Architecture

**There is no enabled flag.** `/config/auth` carries seven `smtp_*` fields and nothing that says
whether custom SMTP is on — "on" is `smtp_host` being set. So:

- The switch reads `smtp_host !== null`.
- Switching on reveals the form; nothing is sent until Save.
- **Switching off and saving nulls every `smtp_*` field**, behind a confirm that says what that costs:
  `smtp_pass` is write-only and cannot be shown again, and on a free project template edits are
  refused again from that moment — measured.

**Gate 2 measures this before it is built**, on a scratch project: set a dummy SMTP config, null it,
and read back what `/config/auth` reports — including whether a null `smtp_pass` is accepted, and
whether `smtp_max_frequency` returns to its default of 60 or to null. Never measured against the
project that has working SMTP.

**A stored password is known from the response, not guessed.** The config returns `smtp_pass` as
null whether or not one is set — measured on a project without one; unmeasured on one with. If the
response cannot distinguish them, the help line says "Enter a password to replace any stored one"
rather than claiming one exists.

**Empty still means "leave it".** A blank password box on save keeps the stored password; only the
switch clears it.

## Related Code Files

- Modify: `components/auth/smtp-settings.tsx` — the rebuild
- Modify: `lib/auth-config-actions.ts` — `clearSmtp`, if gate 2 passes as expected
- Modify: `lib/auth-config.ts` — field labels and help text

## Implementation Steps

1. Gate 2: measure setting and clearing SMTP on a scratch project, restoring it.
2. Whether a stored password is visible in the response on a project that has one — read only.
3. The two-column form with help text and the `seconds` suffix.
4. The switch, and the confirm in front of clearing.

## Success Criteria

- [x] The switch reflects the project's real state.
- [x] Turning it off and saving clears SMTP only after the confirm, and says what it cost.
- [x] A blank password leaves the stored one alone.
- [x] Every field has its help text.

## Risk Assessment

- **This is the one switch on the page that can stop a project's mail**, and it is next to fields
  people edit routinely. The confirm is the mitigation, and it names the password.
- **The project that has working SMTP must not be the one measured against.**

## Built 2026-09-26 — and a bug in the shipped form found on the way

**The existing SMTP save never saved a port.** Measured: `smtp_port` 587 answers
`400 "expected string, received number"`, and the form built in the Authentication plan sent both
numeric fields as numbers. `smtp_max_frequency` wants the opposite — a string answers
`400 "expected number"`. `smtpPatchFrom` builds the body now, and a test pins both types. The old
comment said the API rejected a *string* port; it had the fact backwards.

**This phase's assumption about the password was also wrong.** It said the config returns
`smtp_pass` as null whether or not one is set. That was measured on a project without one; on the
project with Resend it comes back as 64 characters. So a stored password is knowable, and the help
line states it rather than hedging — while the value itself stays on the server.

Gate 2 held: clearing answers 200, reads back null, leaves `smtp_max_frequency` at 60. Measured on
ZKVault and restored; the project with working SMTP was read, never written.
