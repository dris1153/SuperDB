---
phase: 3
title: "Hardening"
status: pending
priority: P2
effort: "1d"
dependencies: [2]
---

# Phase 3: Hardening

## Overview

Checklist only, by request — expand into steps when Phase 2 lands. This phase gates opening signup to
the public: until it is done, the instance should not be advertised.

The app holds write-scoped credentials for other people's infrastructure. Nothing here restricts what
a user may do with their own databases; it only limits how far a compromise travels.

## Checklist

- [ ] **TOTP MFA.** Built into Supabase Auth (`auth.mfa.*`): enroll screen, challenge on login, recovery
      codes. Highest-value item here — a phished SuperDB password otherwise yields write access to that
      user's entire Supabase estate.
- [ ] **Audit log.** One table: `connection_events(user_id, connection_id, event, ip, created_at)`.
      Insert on connect, refresh, revoke, disconnect. Not on every read.
- [ ] **KEK into a KMS.** AWS or GCP KMS, unwrap-only. Vercel provides none, so this means an external
      call. The `v1.` prefix on `dek_wrapped` from Phase 2 makes this a rewrap, not a re-encrypt.
      Until this is done, envelope encryption is hygiene, not a security boundary.
- [ ] **Delete account.** `on delete cascade` already removes the rows; this is a button plus a
      confirmation, and should call `/v1/oauth/revoke` for every OAuth connection first.
- [ ] **CAPTCHA on signup.** Turnstile or hCaptcha, native in Supabase Auth. Turn on when abuse appears,
      not before.
- [ ] **Rate-limit review.** Check Supabase Auth's defaults against real traffic; raise SMTP limits if
      confirmations start bouncing.
- [ ] **Secret rotation runbook.** Write down how to rotate the KEK and the OAuth client secret without
      locking every user out. One page.

## Explicitly dropped

Terms of Service, Privacy Policy, and a public security page — dropped by user decision. Not blocking.
They remain straightforward to add later.

## Success Criteria

- [ ] MFA can be enrolled and is enforced on next login
- [ ] Connect / refresh / revoke each leave an audit row
- [ ] Rotating the KEK does not require re-encrypting stored tokens
- [ ] Deleting an account revokes its OAuth grants upstream and leaves no rows behind
