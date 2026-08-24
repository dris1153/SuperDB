---
phase: 1
title: "Authentication"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Authentication

> **Completed 2026-08-24.**
> Code, typecheck, production build and 8/8 unit tests green. Proxy gate, page rendering, route-handler
> error paths and the GitHub provider handshake verified directly. The four browser flows — signup
> email, confirmation link, GitHub sign-in, password reset — were confirmed working by the user;
> they need a real inbox and a browser and could not be exercised from the tooling here.
>
> Carried forward: leaked-password protection is Pro-gated and stays off.

## Overview

Replace the single-operator gate with real multi-user auth: open signup, GitHub OAuth, email
confirmation, and password reset. After this phase any stranger can create an account and reach an
empty dashboard.

## Requirements

Functional:
- Sign up with email + password, confirm by email, land signed in.
- Sign in / sign up with GitHub in one action.
- Forgot password → email → set new password → signed in.
- `ALLOWED_EMAIL` gone; no email is privileged.

Non-functional:
- Sessions stay cookie-based via `@supabase/ssr`; `proxy.ts` keeps validating with `getUser()`, never
  `getSession()`.
- No open redirects: any `next`/`redirectTo` value must be a relative path.

## Architecture

Supabase Auth does the work. This phase is mostly dashboard configuration plus thin route handlers.

```
/signup ──┐
/login  ──┼─→ server action ─→ supabase.auth.signUp / signInWithPassword
          └─→ signInWithOAuth(github) ─→ Supabase ─→ GitHub ─→ /auth/callback
                                                                    │
                                    exchangeCodeForSession ─────────┘

email link ─→ /auth/confirm?token_hash&type ─→ verifyOtp ─→ / or /reset-password
```

`SITE_URL` env supplies the absolute origin for `redirectTo`. Do not derive it from request headers —
`VERCEL_URL` is the deployment URL, not the canonical domain, and header-derived origins are
attacker-influenced.

## Dashboard configuration (do this first — DNS blocks)

1. **SMTP.** Resend or Postmark, verified sending domain, wired into Auth → SMTP Settings. Built-in
   mail is capped at a few messages per hour and is not for production. DNS verification is the long
   pole; start it before writing code.
2. **Enable signup.** Auth → Sign In / Providers → allow new users to sign up.
3. **GitHub provider.** Create a GitHub OAuth App, callback
   `https://<project-ref>.supabase.co/auth/v1/callback`; paste client id/secret into the GitHub
   provider.
4. **Email templates.** Change Confirm signup and Reset password to point at this app:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
   The default `{{ .ConfirmationURL }}` does **not** work with the SSR flow. Skipping this makes every
   confirmation fail silently.
5. **URL configuration.** Site URL + redirect allowlist covering local dev and production.
6. **Attack protection.** Leaked-password protection (HaveIBeenPwned) requires a **Pro plan** — the
   dashboard shows it as DISABLED on Free. Skipped for now; revisit on upgrade. CAPTCHA stays off until
   abuse appears (Phase 3).
7. ~~**Decide account linking.**~~ **Resolved: merge, and nothing to configure.** Supabase links
   identities sharing an email automatically by default, and removes unconfirmed identities when
   linking, which closes the pre-account-takeover hole. Leave "Allow manual linking" **off** — it
   covers a different case (linking a *different* email while signed in) and only adds attack surface.

## Related Code Files

Create:
- `app/signup/page.tsx`
- `app/forgot-password/page.tsx`
- `app/reset-password/page.tsx`
- `app/auth/callback/route.ts`
- `app/auth/confirm/route.ts`
- `lib/auth-actions.ts`

Modify:
- `app/login/page.tsx` — drop `ALLOWED_EMAIL`, add GitHub button and links to signup / forgot
- `proxy.ts` — widen the public path list
- `.env.example` — remove `ALLOWED_EMAIL`, add `SITE_URL`
- `README.md` — replace the "create your login by hand" section

## Implementation Steps

1. Start the SMTP domain verification. It gates testing everything else.
2. `lib/auth-actions.ts` — server actions shared by the pages:
   `signUpWithPassword`, `signInWithPassword`, `signInWithGitHub`, `requestPasswordReset`,
   `updatePassword`. Each returns by `redirect()`; never wrap `redirect()` in try/catch, it throws by
   design.
   `signInWithGitHub` calls `signInWithOAuth({ provider: "github", options: { redirectTo:
   `${SITE_URL}/auth/callback` } })` and redirects to the returned `data.url`.
3. `app/auth/callback/route.ts` — read `code`, `exchangeCodeForSession`, redirect to a validated
   relative `next` or `/`. Reject absolute URLs.
4. `app/auth/confirm/route.ts` — read `token_hash` and `type`, `verifyOtp`. Send `recovery` to
   `/reset-password`, everything else to `/`. On failure redirect to `/login?error=…`.
5. `app/signup/page.tsx` — mirror the existing login page's structure and styling: email, password,
   submit, GitHub button, link to `/login`. On success show "check your inbox" rather than redirecting,
   since the session does not exist until confirmation.
6. `app/login/page.tsx` — remove the `ALLOWED_EMAIL` branch, add the GitHub button and links.
7. `app/forgot-password/page.tsx` — email field → `resetPasswordForEmail(email, { redirectTo:
   `${SITE_URL}/auth/confirm?type=recovery` })`. Always render the same confirmation message whether or
   not the address exists, so the page is not an account-enumeration oracle.
8. `app/reset-password/page.tsx` — new password field → `updateUser({ password })`. Reachable only with
   a session, which `/auth/confirm` established; leave it behind the proxy gate.
9. `proxy.ts` — `PUBLIC = ["/login", "/signup", "/forgot-password", "/auth"]`. `/reset-password` stays
   protected on purpose: the recovery link creates a session before landing there.
10. Strip `ALLOWED_EMAIL` from `.env.example` and `README.md`; add `SITE_URL`.
11. `grep -rn "ALLOWED_EMAIL" .` must come back empty.
12. `npx tsc --noEmit && npx next build`.

## Success Criteria

- [ ] A fresh address signs up, receives a real email, confirms, and lands signed in
- [ ] GitHub sign-in creates a user and lands signed in
- [ ] Forgot → email → reset → sign in with the new password
- [ ] A signed-out visitor hitting `/` is redirected to `/login`
- [ ] A signed-in visitor hitting `/login` or `/signup` is redirected to `/`
- [ ] Two different accounts see different (empty) connection lists — RLS holds
- [ ] `grep -rn "ALLOWED_EMAIL" .` returns nothing
- [ ] `tsc --noEmit` and `next build` both clean

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Default email templates break the SSR confirm flow, silently | Step 4 is mandatory. Test with a real inbox before calling the phase done. |
| SMTP DNS verification takes hours | Start it as step 1. |
| Account-linking behaviour surprises users later | Decide and record it now, in configuration step 7. |
| Password reset page reachable without a recovery session | Keep it behind the proxy gate; `/auth/confirm` is what grants the session. |
| Forgot-password form leaks which emails exist | Identical response either way. |
