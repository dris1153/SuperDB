---
title: "Authentication"
status: completed
created: 2026-09-25
blockedBy: []
blocks: []
---

# Authentication

Users, OAuth Apps and Emails as a project page of its own. The `auth` slug already exists in
`components/project-nav.tsx` and is greyed; this fills it, and removes the Authentication row from
the settings nav, since its configuration belongs beside the users it governs.

Ground truth: [260925-auth-api-measured.md](../reports/260925-auth-api-measured.md), measured this
session against a live project with throwaway users and a briefly-enabled OAuth server. Where it
disagrees with [260925-auth-research.md](../reports/260925-auth-research.md), it wins — and it
disagrees about server-side filtering, which decides how the Users page is built.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The page, and the users table](phase-01-users-table.md) | completed | ~6h | — |
| 2 | [A user, and what can be done to one](phase-02-user-lifecycle.md) | completed | ~1d | 1 |
| 3 | [Emails](phase-03-emails.md) | completed | ~6h | — |
| 4 | [OAuth Apps](phase-04-oauth-apps.md) | completed | ~5h | 1 |
| 5 | [The Logs tab](phase-05-logs-tab.md) | completed | ~3h | 2 |

## What the measurement settled

- **Users are not on the Management API.** Its entire auth surface is `/config/auth`, signing keys,
  SSO providers and third-party auth. Users live on the project's GoTrue and it answers a Management
  token with `401 No API key found`, so this needs `projectKey()` — the machinery Storage built.
- **`?filter=` narrows server-side; `?email=` is ignored.** The research report says there is no
  server-side filtering and a dashboard must filter in the browser. That would mean paging every
  user into the browser to search. `filter` is a substring match and `x-total-count` moves with it.
- **A listed user has `identities: null`.** Reading one returns them in full, so the details panel
  needs its own request; the table cannot feed it.
- **`generate_link` sends mail** — it set `recovery_sent_at` on the user. It does **not** spend the
  hourly allowance, though: nine consecutive sends answered 200 on 2026-09-26, so
  `rate_limit_email_sent = 2` governs user-initiated mail rather than the admin endpoint. Phase 2
  was planned around a quota that does not bite.
- **OAuth clients answer `{}` when empty and `{clients: […]}` when not.** The same trap
  `listSigningKeys` has a test for, arriving a second time.
- **`client_secret` is not in the list**, but it *is* in the 201 from create and in a single-client
  read — corrected 2026-09-26, this line previously denied the read. The app only lists, so the
  create dialog is the only place it appears here.
- **Enabling the OAuth server takes about a minute to reach GoTrue**, and the flag must be sent with
  `oauth_server_authorization_path` or the PATCH is refused.

## Settled decisions

- **Emails needs no project credential.** It is `/config/auth` and nothing else, which makes it the
  one phase that could be built first if the credential path ever became a problem.
- **Every button that sends mail says what it costs.** Two an hour is small enough that a user who
  does not know will hit it, and the failure arrives as a rate-limit error rather than as anything
  explaining why.
- **Column choice is real state, not a menu.** The table has eight columns and overflows a narrow
  screen; the picker decides what is on screen rather than decorating it.
