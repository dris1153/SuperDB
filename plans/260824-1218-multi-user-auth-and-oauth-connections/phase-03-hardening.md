---
phase: 3
title: "Hardening"
status: in-progress
priority: P2
effort: "1d"
dependencies: [2]
---

# Phase 3: Hardening

## Overview

This phase gates opening signup to the public: until it is done, the instance should not be
advertised.

The app holds write-scoped credentials for other people's infrastructure. Nothing here restricts what
a user may do with their own databases; it only limits how far a compromise travels.

## Checklist

- [x] **TOTP MFA.** Opt-in per account, enforced once enrolled. `/settings` enrolls (QR + verify),
      `/mfa` challenges, `proxy.ts` redirects any session at `aal1` whose `nextLevel` is `aal2`.
      Implemented with server actions — no browser Supabase client was added.
- [x] **Audit log.** `public.connection_events`, written on connect / refresh / refresh_failed /
      disconnect. Append-only by RLS: a user can insert and read their own rows but not update or
      delete them, so a stolen session cannot erase its own tracks. `recordEvent` never throws — a
      lost log line must not fail the operation it records.
- [ ] **KEK into a KMS.** **Blocked:** needs a provider decision (AWS or GCP); Vercel has none.
      Until this is done, envelope encryption is hygiene, not a security boundary.
- [x] **Delete account.** Revokes every OAuth grant, then deletes via `public.delete_own_account()`,
      a security definer function scoped to `auth.uid()`. Chosen over a `service_role` key, which
      would have granted the app RLS bypass everywhere just to serve one button.
- [ ] **CAPTCHA on signup.** Deferred by plan — turn on when abuse appears, not before.
- [ ] **Rate-limit review.** Dashboard work: check Supabase Auth defaults against real traffic, raise
      SMTP limits if confirmations bounce.
- [x] **Secret rotation runbook.** `docs/secret-rotation-runbook.md`.

## Recovery codes — not possible

The original checklist listed recovery codes. **Supabase Auth has none**, and they cannot be built on
top: a homemade recovery code cannot mint an `aal2` JWT, so it would not pass the very check this
phase adds. Only Supabase can issue that claim.

The realistic mitigation is enrolling a second authenticator (Supabase supports multiple factors) or
keeping the TOTP secret somewhere safe. The enrollment screen says this plainly rather than implying a
recovery path exists.

Consequence to accept: **a user who loses their authenticator loses the account.** Recovering it needs
`service_role` access to unenroll the factor, which the app deliberately does not have.

## Explicitly dropped

Terms of Service, Privacy Policy, and a public security page — dropped by user decision. Not blocking.

## Success Criteria

- [x] MFA can be enrolled and is enforced on the next request once verified
- [x] Connect / refresh / disconnect each leave an audit row
- [ ] Rotating the KEK does not require re-encrypting stored tokens — **not met**, see the runbook;
      the `v1.` prefix makes it possible but the dual-key read path is not built
- [x] Deleting an account revokes its OAuth grants upstream and leaves no rows behind

## Verified so far

`tsc` clean, 11/11 unit tests, production build green across 15 routes. The MFA enrollment,
challenge, and account-deletion flows have **not** been exercised end to end — they need a browser, an
authenticator app, and a throwaway account.

## Remaining

1. Run the updated `supabase/schema.sql` (adds `connection_events` and `delete_own_account`)
2. Walk the three flows by hand
3. Decide the KMS provider, or accept env-var key storage and say so in writing
