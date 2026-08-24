# Brainstorm — Multi-user SuperDB: open signup + OAuth connections

Date: 2026-08-24 · Status: design approved, plan not yet written

## Problem

SuperDB today is single-user: one operator, one `ENCRYPTION_KEY`, `ALLOWED_EMAIL` gating login,
Supabase accounts attached by pasting a personal access token.

Requested: drop `ALLOWED_EMAIL`, open to everyone, add signup.

## What that actually changes

Operator stops being the only principal and becomes custodian of other people's credentials.
A Supabase PAT is unscoped, non-expiring, full account control — read every row of every database,
delete projects, rotate DB passwords, read secrets. Strictly more powerful than a DB password.

Consequences:

- One global `ENCRYPTION_KEY` protects N users' estates. Blast radius scales, defense does not.
- Operator can decrypt any user's token — insider-threat position.
- A breach is not "leaked emails", it is total control of N companies' infrastructure.

## Decisions taken

| Question | Decision | By |
|---|---|---|
| Deployment model | One public instance, operator-hosted, strangers sign up | user |
| How users attach Supabase accounts | Both PAT and Supabase OAuth | user |
| SuperDB login | GitHub OAuth **and** email/password | user |
| PAT on the public instance | **Enabled.** Advisor recommended OAuth-only in public mode; user overrode. | user (override) |
| MFA / audit log / KMS | Phase 3, gating public launch | user |

Risk explicitly accepted by the user: the public instance will hold unscoped PATs belonging to
strangers. Mitigation retained: launch is gated behind Phase 3 hardening, so no stranger PAT exists
in the system before MFA + audit log + KMS + ToS are in place.

## Approaches evaluated

| Approach | Verdict |
|---|---|
| Open-source, everyone self-hosts | Rejected by user. Would have removed custodial risk entirely; ~100 LOC. |
| Public instance, PAT only | Rejected as a design — fastest, riskiest. |
| Public instance, OAuth only | Recommended by advisor, overridden. Kept as a config option. |
| Public instance, both PAT + OAuth | **Chosen.** |
| Passwordless (GitHub only) | Rejected by user; would have removed SMTP, confirm and reset flows entirely. |
| Magic link | Rejected — needs SMTP anyway and adds friction to a daily-use tool. |

## Design

### Phase 0 — Spike before writing any UI

Partly resolved from the docs already (see "OAuth capability matrix" below). What remains needs a
real OAuth app plus a token; run `scripts/probe-token.mjs` once with a PAT and once with an OAuth
access token, then diff.

| Still unknown | Impact |
|---|---|
| Does `database/query/read-only` need `Database: Write`, or is `Database: Read` enough? | Docs list "Create a SQL query" under **Write**. If Write is required, listing tables costs a scope that also permits changing DB config and disabling read-only mode. |
| Do `/health`, `/config/disk/util`, `/advisors/*` work under OAuth at all? | Absent from the scope table entirely. If unavailable, the OAuth detail page loses its stat row. |
| Does `/v1/projects` under OAuth return only the authorized org? | Determines how many times a user must connect |
| Is OAuth app creation gated by org plan? | Docs mention no plan restriction, but unverified |

Register the OAuth app first: Supabase Dashboard → Organization settings → OAuth Apps.

### Phase 1 — Authentication

Routes:

```
/login             email+password  +  "Continue with GitHub"
/signup            email+password  +  "Continue with GitHub"
/forgot-password   request reset mail
/reset-password    set new password (recovery session required)
/auth/callback     exchangeCodeForSession — shared by GitHub
/auth/confirm      verifyOtp(token_hash, type) — email confirm + recovery
```

Remove `ALLOWED_EMAIL` from `proxy.ts`, `app/login/page.tsx`, `.env.example`, `README.md`.
Enable signup in the Supabase dashboard.

Known traps:

1. **Email templates must be edited by hand.** Default `{{ .ConfirmationURL }}` does not suit the SSR
   flow. Change to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Skipping this
   makes every confirmation fail.
2. **Account linking.** Sign up as `me@x.com` with a password, then use GitHub whose primary email is
   also `me@x.com` — Supabase may merge or duplicate depending on settings. Decide and configure
   deliberately.
3. **SMTP is a hard blocker.** Built-in mail is limited to a few messages per hour and is documented as
   unsuitable for production. Needs Resend or Postmark with a verified domain.
4. Enable two free toggles: leaked-password protection (HaveIBeenPwned) and Turnstile/hCaptcha under
   Attack Protection.

### Phase 2 — Connections

Rename `supabase_accounts` → `connections`. An OAuth row is a connection to an *organization*, not to
an account; the old name would lie. One real data row exists (the operator's), so migration is free.

```
kind            'pat' | 'oauth'
sb_account_id   gotrue_id            -- PAT only
email                                -- PAT only
org_slug, org_name                   -- OAuth only
dek_wrapped                          -- per-connection data key, wrapped by KEK
access_cipher                        -- PAT, or OAuth access_token
refresh_cipher, expires_at, scopes   -- OAuth only
```

Mode gate, default `pat,oauth` everywhere:

```
CONNECT_MODES=pat,oauth
```

Kept as a knob so PAT can be disabled later by changing an env var rather than redeploying code.

UI: OAuth presented first as the default path, PAT under an "Advanced" disclosure with a
plain-language note that a PAT grants full account control, plus a link to Supabase's token
revocation page. Ordering only — PAT stays fully functional.

OAuth flow, corrected against the official integration guide:

```
GET /v1/oauth/authorize
  client_id, response_type=code, redirect_uri,
  state (httpOnly cookie), code_challenge, code_challenge_method=S256
  organization_slug   (optional, pre-selects the org)
  -- NO scope parameter: it is deprecated. Scopes come from the app registration.

POST /v1/oauth/token
  Content-Type: application/x-www-form-urlencoded    <-- not JSON
  Authorization: Basic base64(client_id:client_secret)   <-- not body fields
  body: grant_type=authorization_code, code, redirect_uri, code_verifier
  -> { access_token, refresh_token, expires_in, token_type }

on expiry -> grant_type=refresh_token
POST /v1/oauth/revoke on disconnect
```

Three things that are easy to get wrong, all corrected above: the form-encoded body, client
credentials belonging in a Basic auth header rather than the body, and `scope` being deprecated as a
query parameter.

`redirect_uri` + `state` together must stay under 4 kB.

Scopes are fixed at app-registration time in the dashboard. **Changing them later forces every
existing user to re-authorize**, so the scope set is a near-permanent decision — pick it after the
Phase 0 spike, not before.

### OAuth capability matrix

From the official scopes table. This is the reason supporting both connection kinds is a functional
decision, not just a convenience: OAuth is lower risk **and** lower capability.

| SuperDB feature | Scope required | Verdict |
|---|---|---|
| List projects, project metadata | `Projects: Read` | works |
| Organization name | `Organizations: Read` | works |
| **Account email** | no scope exists | **impossible over OAuth** — OAuth rows group by org only |
| Table list, sizes, RLS flags | `Database: Write` (probable) | heavy: that scope also allows changing DB config and disabling read-only mode |
| API keys | `Secrets: Read` | heavy: also grants "retrieve a project's secrets". Recommend dropping this panel for OAuth connections. |
| Service health, disk usage, advisors | not in the scope table | unknown, spike it |

The guide also states plainly: *"Only some features are available until we roll out fine-grained
access control. If you need full database access, you will need to prompt the user for their database
password."*

Consequence for the UI: an OAuth connection renders a reduced project detail page. Decide whether to
hide the missing panels or show them disabled with an explanation.

### Phase 3 — Hardening, gates public launch

| Item | Rationale |
|---|---|
| TOTP MFA | Built into Supabase Auth. Phishing one SuperDB password yields that user's entire Supabase estate. Highest-value item on this list. |
| Audit log | One table, insert on connect / refresh / revoke. The thing you will want after an incident. |
| KEK to a real KMS | See note below. |
| ToS + Privacy + Security page | Processing other people's infrastructure credentials. |
| Delete-account button | `on delete cascade` already handles the rows. |

Honest note on envelope encryption: per-connection DEKs wrapped by a master KEK is worth doing (~30
LOC) because it makes key rotation a rewrap instead of a full re-encrypt, and makes a later KMS swap a
one-function change. But while the KEK sits in an env var it is **hygiene, not a security boundary** —
KEK compromise still yields everything. Do not treat it as solved until the KEK lives in AWS or GCP
KMS. Vercel provides no KMS.

## Verified API facts

Sources, both fetched 2026-08-24:
`https://api.supabase.com/api/v1-json`,
`https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration` (+ `/oauth-scopes`).
Append `.md` to any Supabase docs URL to get clean markdown.

- OAuth2 authorization-code flow with PKCE (S256) exists: `/v1/oauth/authorize`, `/v1/oauth/token`,
  `/v1/oauth/revoke`. `authorize` is marked **[Beta]**.
- `organization_slug` is an authorize parameter — authorization is org-scoped.
- Scopes are configured at app registration, **not** per authorize request. The `scope` query
  parameter is deprecated. Changing scopes forces all users to re-authorize.
- Scope families: Auth, Database, Domains, Edge Functions, Environment, Organizations, Projects,
  Rest, Secrets, Storage — each Read and/or Write. **There is no profile or account scope.**
- "Create a SQL query" is classified under `Database: Write`, not Read.
- "Retrieve a project's API keys" is under `Secrets: Read`, alongside project secrets.
- Token endpoint: `application/x-www-form-urlencoded` body, client credentials in a
  `Authorization: Basic base64(id:secret)` header.
- Client secret format: `sb_secret_live_...`; `client_id` is a UUID.
- Official reference implementation:
  `github.com/supabase/supabase/tree/master/examples/edge-functions/supabase/functions/connect-supabase`
- A community SDK exists (`supabase-management-js`); not needed here, the current client is 61 lines.

`scripts/probe-token.mjs` in this repo prints a capability table for any token. Run it with a PAT and
with an OAuth token to answer the remaining Phase 0 questions.

## Success criteria

- A stranger can sign up, confirm their email or use GitHub, and connect a Supabase org via OAuth
  without the operator touching anything.
- A self-hoster can still paste a PAT.
- No plaintext token ever reaches a browser; RLS isolates every row by `user_id`.
- OAuth access tokens refresh automatically without user action.
- Public launch does not happen until Phase 3 is complete.

## Next steps

1. Phase 0 spike — register the OAuth app, run the flow by hand, answer the four unknowns.
2. Feed the spike answers plus this report into `/ck:plan` to produce phase files.
3. Implement Phase 1, then Phase 2, then Phase 3.

## Unresolved

- Which scope set to register the OAuth app with. Decide after the spike; it is near-permanent because
  changing it forces every user to re-authorize. Open question: is `Database: Write` an acceptable ask
  just to list tables, or does the OAuth path ship without the Tables panel?
- Whether to hide or disable the panels an OAuth connection cannot fill.
- Account-linking behaviour between GitHub and email/password sign-ups: merge or keep separate?
- SMTP provider not chosen (Resend vs Postmark).
- KMS provider not chosen; deployment target is Vercel, which has none.

Resolved since the first draft: `/v1/profile` is unavailable over OAuth (no such scope exists), so
OAuth connections group by organization. Email grouping remains a PAT-only feature.
