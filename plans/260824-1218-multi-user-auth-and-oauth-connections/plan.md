---
title: "Multi-user SuperDB: open signup + OAuth connections"
status: in-progress
created: 2026-08-24
blockedBy: []
blocks: []
---

# Multi-user SuperDB

Turn the single-operator tool into a publicly hosted app: anyone signs up, connects their own Supabase
accounts by PAT or OAuth, and sees only their own data.

Design and the live API spike that backs it: [brainstorm-report.md](reports/brainstorm-report.md).
Read it before starting — it records what OAuth can and cannot reach, measured rather than assumed.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Authentication](phase-01-authentication.md) | **completed** | ~1d | — |
| 2 | [Connections](phase-02-connections.md) | pending | ~1.5d | 1 |
| 3 | [Hardening](phase-03-hardening.md) | pending | ~1d | 2 |

Phase 0 (API spike) is complete. Results are in the report.

## Settled decisions

Do not re-open these during implementation:

- Public hosted instance, open signup, strangers register.
- Two connection kinds, both available everywhere. `CONNECT_MODES` defaults to `pat,oauth`.
- Login by GitHub OAuth **and** email/password, with confirmation, password reset and real SMTP.
- OAuth app requests write scopes up front — changing scopes later forces every user to re-authorize.
- `supabase_accounts` becomes `connections`; tokens move to envelope encryption.
- ToS/Privacy dropped. MFA, audit log and KMS stay, in Phase 3.

## What OAuth cannot do

Measured, not guessed. Both endpoints answer `"does not support oauth access yet"`, so no scope fixes them:

- `GET /v1/profile` — no account email. OAuth rows group by **organization** instead.
- `GET /projects/{ref}/config/disk/util` — no disk usage stat.

Everything else the app uses works, including read-only SQL, so the Tables panel survives.
Authorization is per-organization: a user with N orgs must connect N times.

## Key risks

| Risk | Where |
|---|---|
| Email templates ship broken by default; confirmations fail silently | Phase 1 |
| SMTP domain verification blocks on DNS — start it first | Phase 1 |
| Concurrent OAuth token refresh can invalidate a refresh token | Phase 2 |
| A user revoking access upstream must surface as "reconnect", not a dead page | Phase 2 |

## Not in scope

Phase 4 and beyond — table editor, SQL editor, auth user management, storage browser. The product
direction points there, but Phases 1-3 will produce constraints that should shape it. Design it later.

## Next

```
/ck:cook --auto plans/260824-1218-multi-user-auth-and-oauth-connections/phase-01-authentication.md
```

## Status

Audited 2026-09-26: phase 2's file list names `lib/accounts.ts` and `app/(app)/accounts/page.tsx` as the things it replaced, and a `supabase/migrations/` directory that was never adopted — this repo has one idempotent `supabase/schema.sql`. Neither is missing work.
