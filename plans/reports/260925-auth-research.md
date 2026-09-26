# Supabase Auth (GoTrue) Admin API Research – Third-Party Dashboard

**Date:** 2026-09-25  
**Context:** Building third-party Supabase dashboard clone of Authentication section; uses Management API personal access token; no REST user endpoints in Management API.

---

## 1. THE ADMIN USERS API: GET /auth/v1/admin/users

### Pagination & Response Shape

**Status: Documented** (OpenAPI spec via GitHub)

- **Query Parameters:**
  - `page` (int, min: 1, default: 1)
  - `per_page` (int, min: 1, default: 50)
  - No documented query parameters for sorting, filtering, or search

- **Response Structure:**
  ```json
  {
    "aud": "string (deprecated)",
    "users": [/* UserSchema array */]
  }
  ```

- **Pagination Header:** Link header carries pagination metadata. Swift/Elixir SDKs parse it for next_page/last_page. Structure: `Link: <url>; rel="next"` format (standard RFC 5988).

- **Total Count:** Returned in response, but exact field name not found in openapi.yaml extract.

### Filtering, Sorting, Search

**Status: Unknown** (not documented in primary sources)

- GET /admin/users endpoint parameters in openapi.yaml contain **only** `page` and `per_page`.
- **No query parameters for sort_by, filter, or email search found** in any primary source (openapi.yaml, SDK docs, GitHub issues).
- Dashboard has search box + "All columns" selector. **These likely perform client-side filtering** on the full user list, not server-side queries.
- SDKs (JavaScript, Python, Swift) do not expose filter parameters either.

**Inference:** Filtering must happen client-side. Dashboard fetches all users (or paginated chunks) and filters in memory.

---

## 2. USER LIFECYCLE: Admin Endpoints

**Status: Mostly Documented** (SDKs + GitHub issues; exact request bodies partially inferred)

### Create User (with and without auto-confirm)

**Endpoint:** `POST /auth/v1/admin/users`  
**Auth:** Admin JWT (service_role key)

**Request Body Fields** (from OpenAPI + SDK docs):
```json
{
  "email": "string",
  "password": "string",          // optional
  "phone": "string",             // optional
  "email_confirm": boolean,      // auto-confirm email (default: false)
  "phone_confirm": boolean,      // auto-confirm phone (default: false)
  "app_metadata": {...},         // admin-only metadata (JSON)
  "user_metadata": {...},        // user-editable metadata (JSON)
  "role": "string",              // default: "authenticated"
  "aud": "string",               // audience claim (default: from config)
  "ban_duration": "string"       // ISO 8601 duration (e.g., "7d", "100y")
}
```

**Response:** UserSchema object  
**Sends Email:** No email sent on creation; depends on email_confirm flag.

---

### Invite User by Email

**Endpoint:** `POST /auth/v1/admin/generate_link` (or `inviteUserByEmail` in SDKs)  
**Auth:** Admin JWT  
**Request Body:**
```json
{
  "email": "string",
  "type": "invite",
  "redirect_to": "string"        // optional query param, not body
}
```

**Response:** 
```json
{
  "action_link": "https://project.supabase.co/auth/v1/verify?token=...",
  "email_otp": "string",         // if applicable
  "hashed_token": "string",
  "verification_type": "signup_link"
}
```

**Sends Email:** Yes (via auth email template; requires valid SMTP).

---

### Send Magic Link

**Endpoint:** `POST /auth/v1/admin/generate_link`  
**Request Body:**
```json
{
  "email": "string",
  "type": "magiclink",
  "redirect_to": "string"
}
```

**Response:** Same as invite  
**Sends Email:** Yes.

---

### Send Password Recovery Email

**Endpoint:** `POST /auth/v1/admin/generate_link`  
**Request Body:**
```json
{
  "email": "string",
  "type": "recovery",
  "redirect_to": "string"
}
```

**Sends Email:** Yes.

---

### Update User

**Endpoint:** `PUT /auth/v1/admin/users/{user_id}`  
**Auth:** Admin JWT  
**Request Body:** Any of the fields from POST /admin/users (partial update via merge semantics for metadata)  
**Response:** Updated UserSchema  
**Sends Email:** Conditional (e.g., if email is changed and email_change_confirm enabled, a confirmation email is sent).

---

### Ban User (Temporary)

**Status: Documented** (GitHub discussions + SDK examples)

**Endpoint:** `PUT /auth/v1/admin/users/{user_id}`  
**Request Body:**
```json
{
  "ban_duration": "7d"           // or "100y" for permanent
}
```

**Behavior:** 
- `banned_until` field set to ISO 8601 timestamp (current time + duration).
- Blocks sign-in for the duration.
- Does **NOT** revoke existing sessions.
- After expiration, user can sign in again.

**Sends Email:** No.

---

### Remove MFA Factors

**Endpoint:** `DELETE /auth/v1/admin/users/{user_id}/factors/{factor_id}`  
**Auth:** Admin JWT  
**Response:** Confirmation (factor deleted)  
**Side Effect:** User logged out of all active sessions if the deleted factor was verified.  
**Sends Email:** No.

---

### Delete User

**Endpoint:** `DELETE /auth/v1/admin/users/{user_id}`  
**Auth:** Admin JWT  
**Response:** UserSchema (deleted user data)  
**Behavior:** By default, hard delete (removes from auth.users table, cascades to sessions). Soft delete available via config flag.  
**Sends Email:** No.

---

## 3. THE USER OBJECT: Schema & Fields

**Status: Documented** (OpenAPI, SDK examples, DeepWiki)

### Core User Fields

```json
{
  "id": "uuid",
  "aud": "string",                      // audience (e.g., "authenticated")
  "role": "string",                     // JWT role claim (default: "authenticated")
  "email": "string",
  "email_confirmed_at": "ISO 8601",     // when email was confirmed
  "phone": "string",
  "phone_confirmed_at": "ISO 8601",
  "confirmed_at": "ISO 8601",           // synonym for email_confirmed_at (when "Confirm Email" is enabled)
  "invited_at": "ISO 8601",             // when invite was sent
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601",
  "last_sign_in_at": "ISO 8601",        // last successful auth attempt
  "new_email": "string",                // pending email change
  "email_change_sent_at": "ISO 8601",
  "new_phone": "string",
  "phone_change_sent_at": "ISO 8601",
  "reauthentication_sent_at": "ISO 8601",
  "confirmation_sent_at": "ISO 8601",
  "recovery_sent_at": "ISO 8601",
  "banned_until": "ISO 8601 | null",    // when temp ban expires (null = not banned)
  
  "user_metadata": {...},               // user-editable JSON
  "app_metadata": {...},                // admin-only JSON
  "identities": [/* Identity[] */],
  "factors": [/* Factor[] */]
}
```

### Identities Array

```json
{
  "identity_id": "uuid",
  "id": "uuid",
  "user_id": "uuid",
  "identity_data": {...},               // raw provider claims (name, avatar, email, etc.)
  "provider": "string",                 // e.g., "email", "google", "github"
  "provider_id": "string",              // provider's user ID for this account
  "last_sign_in_at": "ISO 8601",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

### Factors Array (MFA)

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "friendly_name": "string",            // e.g., "My Authenticator"
  "factor_type": "totp" | "webauthn",
  "status": "verified" | "unverified",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

### Metadata Semantics

- **user_metadata:** User-editable; only user can PATCH /user; admins can PUT via /admin/users. Stored as JSONB.
- **app_metadata:** Admin-only; regular users get 403 Forbidden. Use for roles, access control, flags.
- **Update Merge:** Both use shallow merge—existing keys preserved, provided keys overwritten.

---

## 4. EMAIL TEMPLATES: Configuration & Restrictions

**Status: Mostly Documented** (Management API + changelog; restrictions enforced in practice)

### Template Configuration Fields

**Management API Endpoint:** `PATCH /v1/projects/{ref}/config/auth`

**Available Fields:**

| Template Type | Subject Field | Content Field |
|---|---|---|
| Signup Confirmation | `mailer_subjects_confirmation` | `mailer_templates_confirmation_content` |
| Invite | `mailer_subjects_invite` | `mailer_templates_invite_content` |
| Magic Link | `mailer_subjects_magic_link` | `mailer_templates_magic_link_content` |
| Email Change | `mailer_subjects_email_change` | `mailer_templates_email_change_content` |
| Password Recovery | `mailer_subjects_recovery` | `mailer_templates_recovery_content` |
| Reauthentication | `mailer_subjects_reauthentication` | `mailer_templates_reauthentication_content` |
| MFA Factor Enrolled | `mailer_subjects_mfa_factor_enrolled_notification` | `mailer_templates_mfa_factor_enrolled_notification_content` |
| (Additional notification templates exist for SMS, webhooks, etc.) |

### Custom SMTP Restriction

**Status: Documented** (official Supabase changelog, June 3, 2026)

**Rule:** Free-tier projects created **after June 3, 2026** using Supabase's default email provider **cannot modify email templates**.

- **Workaround:** Configure custom SMTP provider → full editing restored.
- **Enforced:** Yes, in the Supabase dashboard and Management API (PATCH /config/auth rejected if no custom SMTP).
- **Exceptions:** 
  - Projects created before June 3, 2026: can still edit (for now).
  - Paid plans: unaffected.
  - Custom SMTP on any plan: editing allowed.

**Why:** Abuse mitigation—bad actors were rewriting signup templates with phishing content.

### Template Retrieval

**Endpoint:** `GET /v1/projects/{ref}/config/auth`  
**Response:** Includes current values for all `mailer_subjects_*` and `mailer_templates_*_content` fields.  
**Auth:** Management API personal access token.

---

## 5. OAUTH APPS / OAUTH SERVER: Public API

**Status: Documented, with gaps**

### List OAuth Clients

**Endpoint:** `GET /auth/v1/admin/oauth/clients`  
**Auth:** Admin JWT (service_role key) + `GOTRUE_OAUTH_SERVER_ENABLED=true`  
**Response:**
```json
{
  "clients": [
    {
      "client_id": "string",
      "client_name": "string",
      "client_secret": "string",        // shown only once on creation/regeneration
      "redirect_uris": ["string"],
      "client_type": "public" | "confidential",
      "token_endpoint_auth_method": "string",
      "created_at": "ISO 8601"
    }
  ]
}
```

**Query Parameters:** No pagination/filtering documented.

### Get Single OAuth Client

**Endpoint:** `GET /auth/v1/admin/oauth/clients/{client_id}`  
**Response:** Single client object.

### Create OAuth Client

**Endpoint:** `POST /auth/v1/admin/oauth/clients`  
**Auth:** Admin JWT  
**Request Body:** `{client_name, redirect_uris, client_type, ...}`  
**Response:** New client with secret (shown once).

### Management API Coverage

**Status: NO user endpoints in Management API** (only `/config/auth` for settings)

- Management API `/v1/projects/{ref}/config/auth` → GET/PATCH for auth settings.
- Management API does **NOT** have `/v1/projects/{ref}/auth/users` or similar.
- OAuth CRUD **only via Auth service** (`/auth/v1/admin/oauth/clients`), not Management API.

**Implication:** Dashboard must use Auth service directly for OAuth client management, not Management API.

---

## 6. RATE LIMITS & SAFETY

**Status: Documented (with gaps on admin-specific limits)**

### Email Sending Rate Limits

| Scenario | Rate |
|---|---|
| Supabase default SMTP (cloud projects) | 2 emails/hour |
| Custom SMTP (initial ramp-up) | 30 emails/hour |
| Custom SMTP (after warm-up) | No published limit; depends on provider |
| Free tier, no custom SMTP | **Blocked** (cannot send emails as of Sep 2026) |

**Behavior When Limit Hit:** API returns 429; user receives error.

### Admin API Rate Limits

**Status: Partially Unknown**

- **Management API:** 120 requests/minute (documented).
- **Auth Admin Endpoints** (`/auth/v1/admin/*`): No published rate limits found.
- **Database Context Endpoint:** 10 req/min + 1 req/sec (special case).

**Inference:** Auth admin endpoints likely share project-level rate limits with client auth endpoints, but exact values not publicly documented.

### Projects Without Custom SMTP

- Email endpoints return error or silently fail.
- Free tier restricted since June 2026.
- Workaround: configure custom SMTP via Management API `/config/auth` (requires SMTP credentials).

---

## 7. KEY CONSTRAINTS FOR THIRD-PARTY DASHBOARD

### Constraint #1: No Server-Side User Search/Filtering
The admin API provides **only** pagination (page/per_page), **no query parameters for filtering, sorting, or email search**. The dashboard's search box and column filters must be implemented **client-side**, fetching the full user list in paginated chunks and filtering in JavaScript. This creates a UX problem: searching for a user requires loading potentially thousands of users into memory.

**Mitigation:** 
- Implement client-side in-memory search (reasonable for dashboards with <10k users).
- Consider caching user list in a database for large projects.
- Use auth.users table directly via PostgREST if you also have direct database access.

### Constraint #2: Email Template Editing Locked for Free Tier (June 2026 Onwards)
Free-tier projects created after June 3, 2026 cannot edit email templates without custom SMTP. This is a hard restriction enforced by the Supabase platform and Management API. The dashboard cannot work around it—users must configure their own SMTP to edit templates.

**Mitigation:**
- Clearly communicate SMTP requirement to users.
- Provide guided SMTP setup flow in dashboard.
- Consider offering read-only template view for projects without SMTP.

### Constraint #3: OAuth Apps Only in Auth Service, Not Management API
OAuth client management is **only available via `/auth/v1/admin/oauth/clients`**, not the Management API. This means your dashboard must make direct Auth service calls (with a service_role key) for OAuth client CRUD, breaking from the Management API pattern used elsewhere. The Auth service requires `GOTRUE_OAUTH_SERVER_ENABLED=true` at the server level.

**Mitigation:**
- Use service_role key directly to Auth service for OAuth endpoints.
- Document that OAuth Server must be enabled server-side.
- Gracefully handle 400/403 responses if OAuth Server is not enabled.

---

## Source Credibility Summary

| Source | Credibility | Coverage |
|---|---|---|
| OpenAPI spec (supabase/auth GitHub) | Excellent (primary) | Admin API endpoints, request/response schema |
| SDK documentation (JavaScript, Python, Swift, etc.) | Excellent (derived from spec) | Higher-level abstractions; some details abstracted |
| Supabase blog + changelog | Good (official) | Feature announcements, breaking changes (e.g., SMTP restriction) |
| GitHub issues/discussions | Good | Edge cases, workarounds, undocumented behavior |
| DeepWiki | Fair | User-facing docs; not always up-to-date |

---

## Unresolved Questions

1. **Exact Link header format & pagination cursors:** RFC 5988 standard assumed, but not verified against live endpoint.
2. **Total user count in GET /admin/users response:** Field name unclear; may be missing from some SDKs.
3. **Auth admin endpoint rate limits:** Not published; inferred to be project-level but no specifics.
4. **OAuth clients pagination:** No query parameters documented; assume no pagination support.
5. **Email template custom variables:** Which template has access to which user fields (e.g., {{ .UserEmail }}, {{ .ConfirmationURL }})—not comprehensively documented.
6. **Soft vs. hard delete behavior:** Configurable, but exact flag name/behavior not found.
