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

Risk explicitly accepted by the user: the public instance will hold PATs belonging to strangers.
Mitigation retained: launch is gated behind Phase 3 hardening, so no stranger PAT exists in the
system before MFA + audit log + KMS are in place.

**Revised 2026-08-24 — this risk is smaller than first argued.** See "Access token types" below:
Supabase now issues organization-scoped access tokens with custom expiry, so a user can hand SuperDB
a least-privilege credential rather than an unscoped god-mode one. The original objection to accepting
pasted tokens on a public instance assumed no such option existed. It was overstated.

## Approaches evaluated

| Approach | Verdict |
|---|---|
| Open-source, everyone self-hosts | Rejected by user. Would have removed custodial risk entirely; ~100 LOC. |
| Public instance, PAT only | Rejected as a design — fastest, riskiest. |
| Public instance, OAuth only | Recommended by advisor, overridden. Kept as a config option. |
| Public instance, both PAT + OAuth | **Chosen.** |
| Passwordless (GitHub only) | Rejected by user; would have removed SMTP, confirm and reset flows entirely. |
| Magic link | Rejected — needs SMTP anyway and adds friction to a daily-use tool. |

## Product direction (stated 2026-08-24, after the spike)

The end goal is not an inventory board. It is a working multi-account Supabase dashboard: the user
operates their databases from this web app the way they would in Supabase's own dashboard — table
editing, SQL, and eventually auth/user management. Read-only inventory is the first slice, not the
destination.

Implications:

- Write scopes are required. Settled above.
- Phase 1 (auth) and Phase 2 (connections) are unchanged — they are the foundation either way, and
  nothing in them assumes read-only.
- A future Phase 4+ covers the dashboard surface itself (table editor, SQL editor, auth users,
  storage). Not designed here. Do not let it distort Phases 1-3.

The user also decided end-user-facing legal and gating work (ToS, restricting what users may do to
their own databases) is out of scope: full control is the point of the product. Removed from the
Phase 3 blocking list.

Note the distinction that survives: restricting the *user* is out of scope, but protecting the
*credential store* (encryption at rest, RLS, MFA) is not — it constrains nobody and only changes how
bad a breach is. Those stay in Phase 3.

## Design

### Phase 0 — DONE (2026-08-24)

Ran against a live OAuth app. Results in "OAuth capability matrix" below.

| Question | Answer |
|---|---|
| Does `database/query/read-only` work over OAuth? | **Yes, 201.** (Granted scope set included Database:Write — see "Still open on scopes".) |
| Do `/health`, `/config/disk/util`, `/advisors/*` work? | health **yes**, advisors **yes**, disk util **no** — `"does not support oauth access yet"` |
| Does `/v1/projects` return only the authorized org? | **Yes.** 8 projects, all from the one authorized org. |
| Is OAuth app creation plan-gated? | **No** — created without obstacle. |

Bug found and fixed in existing app code: `getHealth` sent `timeout_ms=4000`, which the API rejects
with `400 timeout_ms: Invalid input: expected number, received string`. Health was broken for every
token type, not just OAuth. Parameter removed; the endpoint works without it.

Two throwaway scripts remain in `scripts/` — `oauth-spike.mjs` (runs the OAuth dance locally, writes
the token to `.env.spike-token.local`) and `probe-token.mjs` (prints a capability table for any
token). Delete them once Phase 2 is done, or keep `probe-token.mjs` as a debugging aid.

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

### OAuth capability matrix — measured, not guessed

Spike run 2026-08-24 against a live OAuth app granted Projects:Read, Organizations:Read,
Database:Read **and** Database:Write. Probed with `scripts/probe-token.mjs`.

| SuperDB feature | Endpoint | OAuth result |
|---|---|---|
| Organization list | `GET /v1/organizations` | **200** |
| Project list | `GET /v1/projects` | **200** — only the authorized org's projects |
| Project metadata | `GET /v1/projects/{ref}` | **200** |
| Service health | `GET /projects/{ref}/health` | **200** |
| Security advisors | `GET /projects/{ref}/advisors/security` | **200** — unexpected bonus, not in the scope table |
| **Table list, sizes, RLS** | `POST /database/query/read-only` | **201 — works** |
| **Account email** | `GET /v1/profile` | **401** — `"does not support oauth access yet"` |
| **Disk usage** | `GET /projects/{ref}/config/disk/util` | **401** — `"does not support oauth access yet"` |
| API keys | `GET /projects/{ref}/api-keys` | **403** — needs scope `api_gateway_keys_read` |

Better than the docs implied. The Tables panel — the main reason to explore a database at all —
survives on OAuth. Only two panels are genuinely lost.

Notes:

- Authorization is strictly per-organization: 8 projects returned, all from the single authorized org.
  **A user with N organizations must connect N times.** Design the connections UI around that.
- The real scope name for API keys is `api_gateway_keys_read`, not the `Secrets: Read` label the docs
  table uses. Trust the 403 message over the docs table when picking scopes.
- Two endpoints answer with `"does not support oauth access yet"` — a platform limitation, not a scope
  problem. Adding scopes will not fix them. Consistent with the guide's own "Current limitations" note.
- Access token lifetime: 86400s (24h). A refresh token is returned.

Consequence for the UI: an OAuth connection renders a project detail page without the "Disk used"
stat and without the API keys panel, and its rows group by organization instead of by email. A PAT
connection renders everything. Decide whether to hide those panels or show them disabled with a
reason.

### Access token types — found 2026-08-24 while testing the PAT flow

Supabase issues two kinds of access token, and only one of them can identify an account:

| Kind | Bound to | `GET /v1/profile` |
|---|---|---|
| Classic personal access token | the **user** | works |
| Scoped access token (capability picker, custom expiry) | an **organization / project** | `403 "This endpoint requires a user-scoped access token"` |

Granting every capability does not help: the endpoint asks *who the token belongs to*, not what it may
do, and an organization has no email. This is the same underlying limit that makes `/v1/profile`
reject OAuth tokens, phrased differently.

**Classic tokens can no longer be created.** Confirmed by the user against the dashboard: the token
screen now always requires picking scopes. So `/v1/profile` is unreachable for every token this app
will ever be handed.

Consequences:

- **Drop the `/v1/profile` call entirely.** Not "try it and fall back" — no new token can satisfy it,
  so the fallback would be the only live branch. `GET /v1/organizations` both validates the token and
  names the row, which is one call instead of two and makes the PAT path mirror the OAuth one.
- `email` and `sb_account_id` stay in the schema as nullable columns. They cost nothing, `ownerLabel`
  already falls back to the organization, and `sb_account_id` participates in the unique index
  expression — removing them would churn the index for no gain.
- The warning copy on the connections page ("full control of the whole Supabase account … no expiry")
  is now simply wrong and must be rewritten around scoped tokens.
- Rejected: requiring a user-scoped token. It is no longer even possible to create one.

### Measured: scoped PAT vs OAuth

Probed 2026-08-24 with a live scoped token. A scoped PAT is **more** capable than OAuth:

| Endpoint | OAuth | Scoped PAT |
|---|---|---|
| `/v1/organizations`, `/v1/projects`, `health`, `advisors`, `query/read-only` | works | works |
| `config/disk/util` | 401 | **200** |
| `api-keys` | 403 | **200** |
| `/v1/profile` | 401 | 403 |

Both are limited to a single organization, so a user with N organizations needs N connections either
way. Neither option dominates: OAuth is safer operationally (auto-refreshing, revocable from the
user's own Supabase settings, nothing pasted), scoped PAT is more complete. **Decision: present them
as equals** rather than burying the token form under an "Advanced" disclosure.

### Scope decision — settled 2026-08-24

**Request write scopes up front.** Not tested whether `Database: Read` alone suffices for read-only
SQL, and deliberately so: the product direction (below) requires write access anyway, and the docs
state that changing an OAuth app's scopes **forces every existing user to re-authorize**. Asking for
the final scope set on day one avoids a forced re-authorization migration later.

Registered scope set — these are the dashboard's checkboxes, one per row:

```
Organizations: Read
Projects:      Read + Write
Database:      Read + Write
Auth:          Read + Write      (user management, per the product direction)
Secrets:       Read              (the API keys panel)
```

The dashboard offers only these ten families (Auth, Database, Domains, Edge Functions, Environment,
Organizations, Projects, Rest, Secrets, Storage), each Read and/or Write. The API reports the
underlying grant names in its errors instead — a 403 from `/api-keys` names `api_gateway_keys_read`,
which is one of the grants behind **Secrets: Read**. Do not go looking for a checkbox by that name.

Note what else `Secrets: Read` carries: "Retrieve a project's secrets" and the pgsodium config. It is
a heavy scope to spend on one UI panel, but it is included now rather than later because adding it
afterwards forces every existing user to re-authorize.

Consequence accepted: the consent screen is longer and lists write permissions. That is honest — the
app genuinely does write.

### Phase 3 — Hardening, gates public launch

| Item | Rationale |
|---|---|
| TOTP MFA | Built into Supabase Auth. Phishing one SuperDB password yields that user's entire Supabase estate — more so now that the app holds write scopes. Highest-value item on this list. |
| Audit log | One table, insert on connect / refresh / revoke. The thing you will want after an incident. |
| KEK to a real KMS | See note below. |
| Delete-account button | `on delete cascade` already handles the rows. |

Dropped by user decision: ToS / Privacy / Security page. Available to add later; not blocking launch.

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

- Whether to hide or disable the two panels an OAuth connection cannot fill (disk usage, and account
  email in the grouping column).
- ~~Account-linking behaviour between GitHub and email/password sign-ups~~ — **resolved: merge.**
  Nothing to configure; Supabase links identities sharing an email automatically and by default, and
  removes unconfirmed identities on link, which closes the pre-account-takeover hole. Manual linking
  stays off. Consequence handled in the signup page: signing up with an address that already has an
  OAuth identity returns an obfuscated success and sends no email, so the "check your inbox" screen
  carries a hint pointing at GitHub.
- SMTP provider not chosen (Resend vs Postmark).
- KMS provider not chosen; deployment target is Vercel, which has none.

Resolved since the first draft:

- `/v1/profile` is unavailable over OAuth — confirmed live, `"does not support oauth access yet"`. OAuth
  connections group by organization; email grouping remains a PAT-only feature.
- Read-only SQL works over OAuth. The Tables panel survives.
- Scope set settled: request write up front, see "Scope decision".
- ToS dropped from the blocking list by user decision.
