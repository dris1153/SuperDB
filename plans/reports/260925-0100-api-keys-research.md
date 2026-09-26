# Supabase Management API: API Keys Endpoints Research

**Date:** 2026-09-25  
**Researcher:** Claude Code (Technical Analyst)  
**Context:** Dashboard API Keys page design — two tabs: "Publishable/Secret Keys" and "Legacy JWT Keys"

---

## Executive Summary

The Supabase Management API exposes full CRUD for the new `sb_publishable_*` and `sb_secret_*` keys via `/v1/projects/{ref}/api-keys`. Legacy JWT keys (`anon`, `service_role`) are managed separately at `/v1/projects/{ref}/api-keys/legacy`. The API surface is stable and well-documented, with one critical caveat: **the `reveal` query parameter does not actually hide the key — the spec says it should redact secrets, but it doesn't.** This is a **measured fact in the superdb codebase** that contradicts the documentation and warrants explicit verification before implementing a reveal button.

---

## 1. CRUD Surface for `/v1/projects/{ref}/api-keys`

| Operation | Method | Path | Request Body | Response | Status | Notes |
|-----------|--------|------|--------------|----------|--------|-------|
| **List Keys** | GET | `/v1/projects/{ref}/api-keys` | — | Array of `ApiKeyResponse_Output` | 200 | Query param: `reveal` (optional, boolean string). Spec claims it controls secret visibility; **measured behavior contradicts this**. |
| **Create Key** | POST | `/v1/projects/{ref}/api-keys` | `CreateApiKeyBody` | `ApiKeyResponse_Output` | 201 | Required: `type` (enum: "publishable" \| "secret"), `name` (string). Optional: `description`, `secret_jwt_template`. No length limits, patterns documented. |
| **Get Key** | GET | `/v1/projects/{ref}/api-keys/{id}` | — | `ApiKeyResponse_Output` | 200 | Query param: `reveal` (optional, boolean string). Same issue as List. |
| **Update Key** | PATCH | `/v1/projects/{ref}/api-keys/{id}` | `UpdateApiKeyBody` | `ApiKeyResponse_Output` | 200 | All fields optional: `name`, `description`, `secret_jwt_template`. Supports partial updates. |
| **Delete Key** | DELETE | `/v1/projects/{ref}/api-keys/{id}` | — | `ApiKeyResponse_Output` | 200 | Query params: `reveal` (optional), `was_compromised` (optional, boolean), `reason` (optional, string). Returns deleted key object. No specific 4xx responses documented beyond standard 401/403/429. |

---

## 2. The `reveal` Parameter Discrepancy (CRITICAL)

### Spec Claims
- **Type:** Query parameter, optional, boolean string
- **Truthy values:** `true`, `1`, `yes`, `on`, `y`, `enabled`
- **Falsy values:** `false`, `0`, `no`, `off`, `n`, `disabled`
- **Documented behavior:** "When `reveal=true`, sensitive fields like the actual secret are included; when `reveal=false` or omitted, these fields are redacted."  
  Source: https://supabase.com/docs/reference/api/v1-get-project-api-key

### Measured Behavior (Superdb)
The `ApiKey` type in `lib/mgmt-api.ts` (lines 27–28) documents:  
> "The real credential. Measured, not assumed: the API returns it at reveal=false too, so callers that only need the publishable key must drop the secret rather than rely on the flag."

**This is a direct contradiction.** The spec says `reveal=false` redacts the key; measurement says it doesn't.

### Implication
- **If the measurement is correct:** The `reveal` parameter is a no-op or only affects display metadata, not the `api_key` field itself. The UI must assume the key is always present and must be hidden by filtering client-side.
- **If the spec is correct:** The measurement must have been made with an old API version, or on a specific project/account configuration.

### Action
**Before designing the Reveal button:** Re-test against the live API with `reveal=true` and `reveal=false` on both publishable and secret keys. Document which key types (if any) actually redact. Flag this in the design phase as a potentially blocking assumption.

---

## 3. Create API Key Request Body: `CreateApiKeyBody`

| Field | Type | Required | Constraints | Notes |
|-------|------|----------|-------------|-------|
| `type` | enum | YES | `"publishable"` \| `"secret"` | Determines the key prefix and RLS bypass behavior. Not a free-form field. |
| `name` | string | YES | (max length not documented) | Human-readable identifier. Displayed in the dashboard. |
| `description` | string | NO | (max length not documented) | Optional metadata for the key's purpose. |
| `secret_jwt_template` | object | NO | (schema not documented) | Likely for custom JWT claims; rarely used. Not documented in the OpenAPI response excerpts. |

**Gaps:** No documented field length limits, patterns, or charset restrictions. No documented rejected field names or reserved values. Assume reasonable limits (e.g., 256 chars for name/description) and test before deploying.

---

## 4. Update API Key Request Body: `UpdateApiKeyBody`

| Field | Type | Optional | Constraints | Notes |
|-------|------|----------|-------------|-------|
| `name` | string | YES | (max length not documented) | Can be updated independently. |
| `description` | string | YES | (max length not documented) | Can be updated independently. |
| `secret_jwt_template` | object | YES | (schema not documented) | Can be updated independently. |

**Key constraint:** `type` is **not** updatable. Once a key is created as publishable or secret, it cannot be converted.

**Design implication:** The "New publishable key" and "New secret key" buttons are essential — reclassifying a key requires creating a new one and deleting the old one.

---

## 5. Response Schema: `ApiKeyResponse_Output`

All endpoints return this object on success (including DELETE):

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | Unique key identifier for PATCH/DELETE/GET. |
| `api_key` | string | The actual credential. Contradictory visibility under `reveal` parameter. |
| `type` | string | Enum: `"publishable"`, `"secret"`, `"legacy"`. Indicates RLS bypass and usage context. |
| `prefix` | string | Short identifier prefix (e.g., `sb_publishable`, `sb_secret`). Useful for UI labeling. |
| `name` | string | User-supplied name from creation or last update. |
| `description` | string | User-supplied description from creation or last update. |
| `hash` | string | Hashed representation of the key (for audit/comparison if key is redacted). |
| `secret_jwt_template` | object | Custom JWT claims configuration (if set). Rarely populated. |
| `inserted_at` | ISO 8601 timestamp | Creation time. |
| `updated_at` | ISO 8601 timestamp | Last modification time (name/description updates). |

---

## 6. Legacy Keys: `/v1/projects/{ref}/api-keys/legacy`

### PUT /v1/projects/{ref}/api-keys/legacy

**Purpose:** Enable or disable all JWT-based legacy keys (`anon` and `service_role`) for the project. This is **not a per-key toggle**; it's a **project-wide switch**.

| Aspect | Details |
|--------|---------|
| **Request** | Query parameter: `enabled` (required, boolean string as `true`/`false` or `1`/`0` etc.) |
| **Request Body** | None. The parameter is in the URL. |
| **Response (200)** | `{ "enabled": true \| false }` — confirms the current state. |
| **Blast Radius** | **Project-wide.** Disabling the flag breaks both `anon` and `service_role` keys immediately. All client code using legacy keys stops working. |
| **Reversibility** | Yes, re-enabling with `enabled=true` restores legacy keys. |
| **GET endpoint** | Not explicitly documented in search results, but likely exists at `GET /v1/projects/{ref}/api-keys/legacy` to read the current state. |

### Design Implication
The "Disable JWT-based API keys" button must carry a strong warning. This is catastrophic for any project still using legacy keys. Recommend adding a confirmation dialog with "This will break all client code using anon and service_role keys" and a recovery instructions link.

---

## 7. JWT Signing Keys (Separate System)

### Relationship to API Keys
JWT signing keys (`/v1/projects/{ref}/config/auth/signing-keys`) are **separate from API keys** and are **not managed on the API Keys dashboard page**. They have their own dedicated settings section.

- **JWT signing keys:** Asymmetric key pairs used by Supabase Auth to sign user session JWTs. Rotatable without affecting API keys.
- **API keys (new):** Short opaque strings (`sb_publishable_*`, `sb_secret_*`) used for REST/GraphQL access. Independent of signing keys.

### Prior Design Assumption (Outdated)
Supabase's older design conflated JWT signing keys with API keys. The new system separates them, allowing rotation of auth keys without reissuing API keys.

**Do not include JWT signing keys in the API Keys page.** They are a separate administrative concern.

Source: https://supabase.com/docs/guides/auth/signing-keys

---

## 8. Key Types and Security Semantics

### Publishable Keys (`sb_publishable_*`)

| Aspect | Value |
|--------|-------|
| **RLS Bypass** | NO — always enforced |
| **Postgres Role** | `anon` (unsigned) or `authenticated` (signed-in user) |
| **Safe in Browser** | YES |
| **Safe in Source Control** | YES (treat as non-sensitive) |
| **Supabase Guidance** | Can be embedded in frontend code, public GitHub repos, mobile apps. Enforced by RLS policies. |

### Secret Keys (`sb_secret_*`)

| Aspect | Value |
|--------|-------|
| **RLS Bypass** | YES — full `BYPASSRLS` capability |
| **Postgres Role** | `service_role` |
| **Safe in Browser** | NO — Supabase actively blocks secret keys in browser contexts by checking User-Agent and returning 401 |
| **Safe in Source Control** | NO — must stay in env vars/vaults only |
| **Supabase Guidance** | Server-side only: backends, Edge Functions, secure APIs, microservices. Never expose to clients. |

### Legacy `anon` Key (JWT)

| Aspect | Value |
|--------|-------|
| **Equivalent** | Publishable key (same RLS enforcing behavior) |
| **Status** | Deprecated, scheduled removal end of 2026 |
| **Type Field** | Shows as `"legacy"` in API responses |

### Legacy `service_role` Key (JWT)

| Aspect | Value |
|--------|-------|
| **Equivalent** | Secret key (same BYPASSRLS behavior) |
| **Status** | Deprecated, scheduled removal end of 2026 |
| **Type Field** | Shows as `"legacy"` in API responses |

**UI Guidance:**
- Display publishable keys with a ✓ icon and "Safe to expose" label.
- Display secret keys with a ⚠️ icon and "Keep confidential — grants full database access" label.
- Display legacy keys with a deprecation warning and "Scheduled removal by end of 2026" notice.

Source: https://supabase.com/docs/guides/getting-started/api-keys

---

## 9. Error Responses

### Standard Errors (All Endpoints)

| Status | Meaning |
|--------|---------|
| 401 | Unauthorized — invalid or expired token |
| 403 | Forbidden — user lacks required permissions (e.g., no `api_gateway_keys_write` for POST) |
| 429 | Rate limited — exceeds 120 req/min per user per project |

### Documented Errors
**The OpenAPI spec does not document endpoint-specific 4xx responses** (e.g., "key not found" for GET /.../{id}, "name already exists" for POST). Only the standard 401/403/429 set is declared.

### Implication
Assume all deletion, update, and retrieval failures are communicated via response body text (not status code), as is typical for Supabase's error responses. Test with invalid IDs and invalid update payloads to capture actual error messages.

---

## 10. Rate Limits

**Standard limit:** 120 requests per minute per user per project (applies to api-keys endpoints).  
Source: https://supabase.com/docs/reference/api/introduction

**Response headers:**
- `X-RateLimit-Limit`: 120
- `X-RateLimit-Remaining`: count of requests left
- `X-RateLimit-Reset`: Unix timestamp of reset

**Note:** Creating and revealing keys is a write-ish path that a UI could easily hammer. Consider debouncing "copy" actions and throttling "reveal" toggles to prevent hitting the limit.

---

## 11. Authentication & Permissions

All endpoints require:
- **Bearer Token:** Personal Access Token (PAT) or OAuth token  
- **Format:** `Authorization: Bearer <token>`  
- **Scopes (OAuth):** `secrets:read` (GET), `secrets:write` (POST/PATCH/DELETE)

**Fine-grained Permissions:**
- `api_gateway_keys_read` — list and read keys
- `api_gateway_keys_secret_read` — additionally see the `api_key` field (if the reveal behavior were working as documented)
- `api_gateway_keys_write` — create, update, delete keys

**Design Context:** The dashboard admin calling these endpoints will have full scopes. If implementing multi-tenant or delegated admin, these permissions become relevant.

---

## Unresolved Questions

1. **Reveal parameter behavior:** Does `reveal=true` actually change the response, or is the parameter ignored? Needs re-measurement against live API.
2. **Field length limits:** No documented max length for `name` or `description`. Assume 256 chars; test and document.
3. **Deleted key object in DELETE:** The spec says the deleted key is returned (status 200), but does it include the secret? Test with and without `reveal=true`.
4. **GET legacy keys endpoint:** Supabase docs mention PUT but not GET for `/v1/projects/{ref}/api-keys/legacy`. Likely exists but not documented. Test before building the UI.
5. **Specific 4xx errors:** No documented "key not found", "name already exists", or validation errors. Capture and document actual responses during implementation.
6. **Concurrent deletes:** If a key is deleted while the user has the page open, does the page fetch before or after deletion? Consider polling vs. live updates.

---

## Verification Strategy

**Before implementation begins:**

1. **Test reveal parameter** with a live Supabase project:
   ```bash
   curl -H "Authorization: Bearer $PAT" \
     "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=false" \
     | jq '.[] | {id, api_key, prefix}'
   
   curl -H "Authorization: Bearer $PAT" \
     "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true" \
     | jq '.[] | {id, api_key, prefix}'
   ```
   Compare the `api_key` fields. If they're identical, the parameter is not controlling visibility.

2. **Test error conditions:**
   - GET non-existent key → capture error message
   - Create duplicate name → capture error message
   - Update key with invalid type → capture error message
   - DELETE key with `was_compromised=true` → does it behave differently?

3. **Test field limits:**
   - POST with name > 256 chars → does it truncate or reject?
   - POST with empty name → does it reject with validation error?

4. **Read the legacy keys endpoint:**
   - Test GET `/v1/projects/{ref}/api-keys/legacy` (if it exists)
   - Confirm the state machine for enabling/disabling

---

## Source Citations

- **OpenAPI Spec:** https://api.supabase.com/api/v1-json
- **Create API Key:** https://supabase.com/docs/reference/api/v1-create-project-api-key
- **Get API Key:** https://supabase.com/docs/reference/api/v1-get-project-api-key
- **Update API Key:** https://supabase.com/docs/reference/api/v1-update-project-api-key
- **Delete API Key:** https://supabase.com/docs/reference/api/v1-delete-project-api-key
- **Legacy API Keys:** https://supabase.com/docs/reference/api/v1-update-project-legacy-api-keys
- **API Keys Guide:** https://supabase.com/docs/guides/getting-started/api-keys
- **Management API Intro (auth, rate limits):** https://supabase.com/docs/reference/api/introduction
- **JWT Signing Keys:** https://supabase.com/docs/guides/auth/signing-keys
- **Migration Guide:** https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- **Measured fact (superdb):** https://github.com/dris1153/superdb/blob/main/lib/mgmt-api.ts#L27-L28 (ref: local codebase, `lib/mgmt-api.ts`)

---

## Recommendation

**The API surface is stable and complete.** The dashboard design can proceed with confidence on all endpoints except the Reveal button. **Prioritize resolving the `reveal` parameter contradiction** — this determines whether the button can be implemented simply (toggle a flag) or requires client-side key filtering (more complex, slower UX). The design should:

1. **Create/List tab:** Full CRUD with name/description fields, copy button, "New key" buttons, per-row delete.
2. **Reveal button:** Block implementation pending verification. If the parameter works, toggle and refetch. If it doesn't, hide secrets client-side after fetching (requires extra care to not log them).
3. **Legacy keys tab:** "Disable JWT-based keys" button with strong confirmation UX and recovery links.
4. **Error handling:** Gracefully handle non-documented 4xx responses and surface them to the user.

**The API Keys page is implementable now.** The reveal parameter should not block the rest of the feature.
