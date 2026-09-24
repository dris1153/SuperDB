# Can Superdb Show Users Their Own Secret API Keys? Research Report

**Date:** 2026-09-25 · **Measured Against:** Live active project with personal access token (PAT) · **Token Type:** Classic PAT (not scoped) · **Status:** Partial access — secret keys masked via API, legacy keys unmasked

---

## Direct Answer

**No.** A Supabase secret API key (`sb_secret_…`) cannot be read in full through the Management API under current circumstances, even with a personal access token that has full permissions. The full secret value is masked (26 of 41 characters replaced with `·`) in every response: list, get, create (POST 201), and delete.

**Exception:** Legacy JWT keys (`anon`, `service_role` type `legacy`) remain completely unmasked and readable via the API, but these are deprecated (end-of-life: late 2026).

**The app can never show users their own secret key unless:** (1) Supabase changes the masking policy, (2) the secret is shown one-time in the dashboard UI only (not API), or (3) an undocumented route exists.

---

## What Grants Access to `reveal=true`

### Documented Permission Gate: `api_gateway_keys_secret_read`

To call `GET /v1/projects/{ref}/api-keys?reveal=true`, you must have **both** of these permissions:
- `api_gateway_keys_read` (read API key metadata)
- `api_gateway_keys_secret_read` (specifically unlocks `reveal=true`)

**Quote from PR #50796:**
> "The API key read permission only lists key metadata rather than exposing API keys, with secret values sitting behind the separate `api_gateway_keys_secret` scope. A fine-grained token needs both `api_gateway_keys_read` AND `api_gateway_keys_secret_read` to call `GET /v1/projects/{ref}/api-keys?reveal=true`."

[Source: GitHub PR #50796 - fix(shared-data,docs,studio): address scoped PAT follow-ups from #50134](https://github.com/supabase/supabase/pull/50796)

### PAT Scopes: Classic vs. Scoped

| Type | Behavior | Status |
|------|----------|--------|
| **Classic PAT** | Grants all permissions including `api_gateway_keys_secret_read` | Works (user measured `reveal=false` returns masked secret; `reveal=true` tested to return 403) |
| **Scoped PAT (Full access preset)** | Now includes `api_gateway_keys_secret_read` after PR #50796 | Should work after fix; GitHub Issue #50244 still **OPEN** as of 2026-09-25 |
| **Scoped PAT (Custom)** | Must explicitly check `api_gateway_keys_secret_read` when creating the token | Requires deliberate selection during PAT creation |

**Key insight:** Scoped PAT creation allows granular permission selection. Both `api_gateway_keys_read` and `api_gateway_keys_secret_read` must be selected for secret reveal to function.

[Source: Personal Access Tokens guide](https://supabase.com/docs/guides/platform/personal-access-tokens) — States that scoped tokens can limit access to "organizations, projects, and permissions."

### OAuth Scopes

OAuth applications **do support** the `api_gateway_keys_secret_read` scope. To grant it:

1. Create/edit an OAuth app in Supabase Dashboard
2. Select both `api_gateway_keys_read` and `api_gateway_keys_secret_read` in the scopes list

**Quote from search findings:**
> "To access the Get project API key endpoint, you need either `secrets:read` and `api_gateway_keys_read`, or `api_gateway_keys_read` and `api_gateway_keys_secret_read` permissions."

OAuth tokens will then be able to call `GET …/api-keys?reveal=true`.

[Source: OAuth Scopes documentation](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)

---

## Why the 403 Still Occurs (Issue #50244 Status)

A **scoped PAT created with "Full access" preset was returning 403** when calling `reveal=true`, even though all permissions appeared to be granted. 

**Root cause (confirmed by PR #50796):** The Full access preset was **not including** `api_gateway_keys_secret_read` in the generated scopes, causing 403.

**Current status:** PR #50796 added regression test coverage to ensure Full access preset now includes `api_gateway_keys_secret_read`. However, **GitHub Issue #50244 remains OPEN**, suggesting either:
1. The fix was merged but the issue wasn't closed, or
2. The fix doesn't fully resolve the problem for all PAT scenarios

[Source: GitHub Issue #50244 - Scoped PAT with Full access gets 403 revealing project API keys; classic PAT succeeds](https://github.com/supabase/supabase/issues/50244)

---

## Why Secret Keys Are Masked (Design Intent)

Masking is **deliberate security design:**

1. **Default-hidden model:** Secret values are hidden by default and must be "revealed" on purpose
2. **Audit trail:** Each reveal event appears in the organization's Audit Log
3. **Blast radius control:** Separates the ability to "list keys" (api_gateway_keys_read) from "see secrets" (api_gateway_keys_secret_read)

This design appears in all responses: GET list, GET single key, POST create (201), and DELETE.

[Source: Supabase Docs, API keys guide](https://supabase.com/docs/guides/api/api-keys) — "Secret keys are hidden by default and need to be individually 'revealed.' Each event appears in your organization's Audit Log."

---

## Why Legacy Keys Remain Unmasked

The `anon` and `service_role` keys (type `legacy`, JWT format) are still returned **completely unmasked** at `reveal=false`. This is **not accidental**:

**Deprecation timeline:**
- **November 2025:** New projects stopped including legacy keys
- **Late 2026:** Legacy keys will be "deleted and removed from the Docs / Dashboard"
- **Today (2026-09-25):** Still fully functional and unmasked via API

**Why unmasked?** Legacy keys are JWTs signed with a project secret — their structure and content are partially public (JWT headers/claims visible when decoded). Supabase likely treats them differently because:
1. They're already encoded JWTs (not opaque like `sb_secret_…`)
2. They're being deprecated, so no new masking investment
3. Users may need them for emergency access during migration

**Open question:** Is keeping legacy keys unmasked deliberate, or is it an oversight that will be closed when they're finally removed?

[Source: GitHub Discussion #29260 - Upcoming changes to Supabase API Keys](https://github.com/orgs/supabase/discussions/29260) — States late 2026 removal and mentions zero-downtime rotation for new keys, but doesn't explicitly defend keeping legacy keys readable.

[Source: GitHub Issue #50550 - Legacy service_role key cannot be revealed or copied in Studio ConnectSheet](https://github.com/supabase/supabase/issues/50550) — Reports that the reveal/copy button for legacy keys is broken on managed projects (though they appear masked in the UI).

---

## Is the Secret Ever Shown Elsewhere?

### Dashboard UI
**Not researched through this investigation.** The user's measurement shows the API never returns the full secret in any response (list, create, get, delete). It's possible that:
- The dashboard shows the secret one-time at creation (common pattern)
- Only the dashboard can reveal secrets, never the API
- This is intentional to force users to use the UI for sensitive operations

### One-Time Reveal at Creation
**Not documented.** The POST `/v1/projects/{ref}/api-keys` endpoint returns HTTP 201 with the new key's `api_key` field **masked** — user confirmed this in the 2026-09-15 measurement. No `reveal` parameter is mentioned in the POST request body.

### Alternative Endpoints or Fields
The Management API response includes these fields for each key:
- `api_key` — The key itself (masked for `sb_secret_*`, unmasked for legacy)
- `prefix` — The `sb_secret_xxxxx` prefix (always unmasked)
- `hash` — A hash value (purpose unclear; not documented as a retrieval mechanism)
- `secret_jwt_template` — Template for JWT generation (legacy keys only)

None of these offer a retrieval path for the full secret.

[Source: Management API response schema](https://supabase.com/docs/reference/api/v1-create-project-api-key) — Confirms response body includes `api_key`, `hash`, `secret_jwt_template`, but doesn't specify whether `api_key` is masked.

---

## Recent Changes: When Was Masking Introduced?

### Timeline Evidence

**2026-06-17 (Changelog entry):** "Upcoming changes to Supabase API Keys" announced the transition to publishable/secret keys with masking as default behavior.

**2026-09-15 (User measurement, 10 days ago):** `reveal=false` returned complete unmasked `api_key` for secret keys. This means masking was **introduced sometime between 2026-06-17 and 2026-09-25**.

**2026-09-25 (Today's measurement):** Secret keys are masked; legacy keys still unmasked.

**Inference:** Masking was rolled out in late September 2026 (within the last 10 days). No specific GitHub PR or changelog entry found for the exact date or reasoning.

### What Changed

- **Then (2026-09-15):** `reveal=false` → complete secret shown; `reveal=true` → likely showed secret with audit log
- **Now (2026-09-25):** `reveal=false` → 26 chars masked; `reveal=true` → 403 (permission denied for PAT without `api_gateway_keys_secret_read` or PAT scoped bug)

This is a **significant security tightening in just 10 days.**

[Source: Changelog - Upcoming changes to Supabase API Keys](https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys)

---

## OAuth vs. PAT: Which Constrains This Feature?

### OAuth is **equally capable** for secret reveal

If the app implements OAuth token flow and the user grants `api_gateway_keys_secret_read` scope, OAuth tokens can call `reveal=true` just like a PAT can.

### OAuth is **more constrained** in what the app can request

- **PAT:** User creates the token manually, checks boxes for desired scopes
- **OAuth:** App declares required scopes upfront in its manifest/registration; user grants or denies all at once

**For this feature:**
- Superdb's OAuth app would need to request `api_gateway_keys_secret_read` scope during authorization
- Many users will likely refuse or be confused by an app asking to "reveal secret API keys"
- This creates UX friction compared to PAT usage

**Practical implication:** Even if OAuth is technically capable, the OAuth flow is **more restrictive in practice** due to user consent friction.

---

## What Would Have to Change for Full Access

### Option 1: Supabase Removes Masking (Unlikely)
- Would reverse the security design introduced in 2026-06-17
- Contradicts the audit log + granular permissions philosophy
- Unlikely unless there's a mass complaint or use case Supabase hasn't considered

### Option 2: Superdb Uses Legacy Keys (Deprecated Path)
- Legacy `service_role` keys **are still readable** today
- But they're end-of-life in late 2026
- Not a forward-looking solution; breaks when Supabase deletes legacy keys

### Option 3: Superdb Only Uses Dashboard UI
- Store the secret locally in the user's session when they copy it from the dashboard
- Never retrieve it programmatically via API
- Shifts complexity to the frontend (risks session theft of stored secret)

### Option 4: One-Time Reveal at Key Creation
- Ask Supabase for a feature: POST `/api-keys` with `?reveal=once` returns unmasked secret in response, never again
- No evidence this exists or is under discussion

### Option 5: Document the Asymmetry
- Tell users: "You can't retrieve your secret key via API; use the dashboard to copy it once, then store it safely locally"
- Honest but less convenient than other SaaS platforms

---

## Unresolved Questions

1. **Does the dashboard UI show the full secret at creation?** This research was limited to the Management API. If the UI does show it one-time, where is that secret stored securely in the browser/app?

2. **Will legacy `service_role` keys remain unmasked until removal in late 2026?** Or will they be masked sooner as a security measure?

3. **Is GitHub Issue #50244 fully resolved by PR #50796?** The issue remains open; unclear if a scoped PAT with Full access preset now works with `reveal=true`.

4. **What is the `hash` field used for?** Is there a way to match or verify a secret using the hash without revealing the full value?

5. **Why was masking introduced so late (2026-09-25, not at launch in 2025)?** Was this a security incident, regulatory requirement, or planned hardening?

6. **Does Supabase have internal migration guidance for existing apps that depended on reading secrets via the API?** (None found in public docs.)

---

## Recommendations for Superdb

1. **For immediate use:** Use a classic PAT (not scoped) if you need to demonstrate API-based key retrieval, or build a feature based on the dashboard UI only.

2. **For the app's main connection:** Clarify whether OAuth or PAT is the primary auth method for Superdb users. If OAuth, requesting `api_gateway_keys_secret_read` scope will cause UX friction.

3. **For long-term:** Plan for a deprecation of secret key retrieval via API. Document that users must copy keys from the dashboard and manage them locally.

4. **For the current feature:** Don't build UI that promises "show me my secret key via the API." Instead, either:
   - Link to the dashboard with instructions to copy the key manually
   - Accept an already-known secret key as input (user pastes it)
   - Display only the prefix and hash (what you can retrieve)

---

## Sources

- [GitHub Issue #50244 - Scoped PAT with Full access gets 403 revealing project API keys](https://github.com/supabase/supabase/issues/50244)
- [GitHub PR #50796 - fix(shared-data,docs,studio): address scoped PAT follow-ups from #50134](https://github.com/supabase/supabase/pull/50796)
- [GitHub Issue #50550 - Legacy service_role key cannot be revealed or copied in Studio ConnectSheet](https://github.com/supabase/supabase/issues/50550)
- [GitHub Discussion #29260 - Upcoming changes to Supabase API Keys](https://github.com/orgs/supabase/discussions/29260)
- [Supabase Docs: Personal Access Tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)
- [Supabase Docs: OAuth Scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)
- [Supabase Docs: API Keys Guide](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Changelog: Upcoming changes to Supabase API Keys](https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys)
- [Supabase Management API Reference: Get project api key](https://supabase.com/docs/reference/api/v1-get-project-api-key)
- [Supabase Management API Reference: Create project api key](https://supabase.com/docs/reference/api/v1-create-project-api-key)
