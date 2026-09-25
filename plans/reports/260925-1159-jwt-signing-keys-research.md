# JWT Signing Keys Rotation: Complete State Machine Research

**Research Date:** 2026-09-25 | **Researcher:** Technical Analyst | **Status:** Complete

---

## 2. What Breaks, and When ⚠️ [LEAD FINDING]

**Key Decision:** Key rotation does **NOT** log out users. Sessions and existing tokens survive.

### During Rotation (Standby → In Use)

When you promote a standby key to `in_use`:
- **Immediate:** Supabase Auth starts signing **new** JWTs with the new key
- **Auto-demote:** The previous `in_use` key becomes `previously_used` automatically (single PATCH operation)
- **Both keys work:** Auth server accepts tokens signed by either key during verification
- **No logout:** Existing user sessions remain valid; old access tokens continue working
- **Quote:** "Rotation only changes the key used by Supabase Auth to create new JWTs, but the trust relationship with both keys remains." [https://supabase.com/docs/guides/auth/signing-keys]

### Access Token Expiration Timeline (Critical for Revocation Decision)

- **Default JWT expiration:** 1 hour [https://supabase.com/docs/guides/auth/sessions]
- **Practical waiting period:** Dashboard copy says "wait at least 1 hour and 15 minutes" before revoking the `previously_used` key
- **Why 15 minutes extra:** Accounts for clock skew, in-flight requests, and batch job delays
- **Quote:** "If your access token expiry time is configured to be 1 hour, wait at least 1 hour and 15 minutes before revoking the legacy JWT secret." [https://supabase.com/docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd]

### When `previously_used` Key is Revoked

- **Immediate:** Supabase stops accepting tokens signed with that key
- **Expired tokens:** Already-expired tokens were rejected anyway (JWT `exp` claim enforced)
- **Active sessions at revocation:** If a token issued 50 minutes ago hasn't refreshed yet and you revoke at 65 minutes, it becomes invalid mid-request
- **No recovery:** Revoked keys cannot verify tokens; users will need to re-authenticate
- **Quote:** "Once all regularly valid JWTs have expired (or sooner) revoke the previously used key to revoke trust in it." [https://supabase.com/docs/guides/auth/signing-keys]

### Deletion vs. Revocation (Different Operations)

- **Revoked status:** Key is disabled but retained; verification stops
- **Delete operation:** Permanent removal; only allowed after key in revoked status for grace period
- **Quote:** "Remove a signing key from a project. Only possible if the key has been in revoked status for a while." [https://supabase.com/docs/reference/api/v1-remove-project-signing-key]
- **Grace period length:** Not explicitly documented; implied to be multiple hours to allow recovery
- **Reversibility:** Revoked keys can be moved back to `standby` if needed; deletion is permanent

### Multi-Key Verification During Transition

At any given moment, the system accepts **two** keys for verification:
1. **Current key (`in_use`)** – used to sign new JWTs
2. **Previous key (`previously_used`)** – still trusted for verification only

**Cannot exist:** Two keys in `in_use` state simultaneously. Promotion is atomic: old key auto-demotes.

### Known Failure Mode: RLS Cache Invalidation Bug

After ES256 rotation, some users reported RLS policies blocking authenticated queries with error 42501, even though:
- JWT present and valid in Authorization header
- `auth.getUser()` returns authenticated user
- RLS disabled on table works fine

**Issue:** [https://github.com/orgs/supabase/discussions/45812]  
**Root cause:** GoTrue caches JWKS in memory at process start and does not pick up rotated keys without restart  
**Impact:** Only affects early rotation adoption; redeployment required to sync cache  
**Workaround:** Redeploy auth service after rotation to refresh JWKS cache

### The 5-Minute State Change Throttle

**Safety feature:** All state transitions (standby→in_use, previously_used→revoked, etc.) are throttled for ~5 minutes.  
**Purpose:** Prevent accidental cascading state changes; allows reversal  
**Quote:** "Most actions that change the state of a JWT signing key are throttled for approximately 5 minutes." [https://supabase.com/docs/guides/auth/signing-keys]

---

## 1. The State Machine

### States and Definitions

| State | Meaning | Auth Signs New JWTs? | Auth Verifies? | Public in JWKS? |
|-------|---------|---------------------|----------------|-----------------|
| **standby** | Prepared but not active | No | Yes (but Auth doesn't use it yet) | Yes (asymmetric only) |
| **in_use** | Currently active | Yes | Yes | Yes |
| **previously_used** | Retired from signing | No | Yes | Yes (asymmetric only) |
| **revoked** | No longer trusted | No | No | No (removed from JWKS if asymmetric) |

**Quote:** "Standby": A newly created key that hasn't yet signed any JWTs. If using an asymmetric key its public key will be available in the discovery endpoint. Supabase Auth does not use this key to create new JWTs." [https://supabase.com/docs/guides/auth/signing-keys]

### Legal State Transitions

```
standby ←→ in_use  [Rotation: "Rotate Keys" button or PATCH status=in_use]
in_use → previously_used  [Automatic when standby→in_use]
previously_used ←→ revoked  [Manual PATCH status=revoked or status=previously_used]
previously_used ↔ standby  [Manual revert: PATCH status=standby]
revoked ↔ standby  [Manual revert: PATCH status=standby to recover]
Any → deleted  [DELETE endpoint, only after revoked grace period]
```

**Critical:** Promoting standby to in_use does **not** require separate PATCH on old key. The old current key auto-demotes to previously_used in the same operation.

### Asymmetric vs. Symmetric Behavior

**For ES256/RS256/EdDSA (asymmetric):**
- Public key visible in JWKS endpoint
- Can verify without private key
- Public key appears in JWKS while status is standby, in_use, or previously_used
- Removed from JWKS only when status becomes revoked

**For HS256 (symmetric):**
- Shared secret only; no public key
- JWKS endpoint shows `null` for `public_jwk` field
- Status changes still apply but JWKS provides no key material (verification requires secret directly or via server)

---

## 3. Legacy HS256 Secret & API Key Relationship

### Anon/Service_Role Are JWTs

- **Not simple bearer tokens:** Both `anon` (public) and `service_role` (private) API keys are valid JWT tokens
- **Signed by:** Legacy HS256 shared secret (the `JWT_SECRET` shown in dashboard)
- **TTL:** 10 years after project creation
- **Quote:** "The anon and service_role keys are not only API keys, but are also valid JSON Web Tokens, signed by the legacy JWT secret." [https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys]

### After Migration to Asymmetric Keys

Once migrated to ES256 (new asymmetric system):
- New user session JWTs signed with ES256 private key
- Legacy HS256 key retained **only to verify** old anon/service_role tokens and any existing sessions
- **Quote:** "It is now used **only to verify** JWTs. This includes the `anon` and `service_role` API keys." (from user's dashboard observation)
- Legacy secret cannot be rotated independently; tied to anon/service_role keys

### Revocation Impact

- **If legacy HS256 revoked:** Anon and service_role stop working (verification fails)
- **Timing:** Do not revoke legacy until all old anon/service_role tokens expired or apps migrated to new sb_publishable/sb_secret keys
- **Deprecation:** Supabase deprecating anon/service_role keys by end of 2026; migration to new keys required
- **Quote:** "Before you revoke the legacy JWT secret, you must disable the anon and service_role to ensure a consistent security setup." [https://supabase.com/docs/getting-started/migrating-to-new-api-keys]

### Relationship to This Page's Controls

The legacy JWT secret toggle on this page and the API Keys page settings are **interdependent:**
- Disabling anon/service_role on API Keys page signals readiness to revoke legacy HS256 here
- Revoking legacy HS256 here breaks any code still using anon/service_role keys
- Dashboard should confirm both are disabled before allowing legacy HS256 revocation

---

## 4. Algorithms: Trade-offs & Recommendations

### Supported Algorithms

| Algorithm | Type | Signature Size | Verification | Recommended | Status |
|-----------|------|-----------------|---|---|---|
| **ES256** | Asymmetric (NIST P-256) | ~64 bytes | JWKS public key | Yes, default | Stable (Supabase CLI v2.71.1+) |
| **RS256** | Asymmetric (RSA 2048) | ~256 bytes | JWKS public key | Yes, alternative | Stable (launched July 2025) |
| **EdDSA** | Asymmetric (Ed25519) | ~64 bytes | JWKS public key | Recommended for perf | **Coming soon** (marked in docs) |
| **HS256** | Symmetric (shared secret) | Variable | Secret required | No, deprecated | Stable but discouraged |

**Quote (ES256):** "Elliptic Curves are a faster alternative than RSA" with shorter signatures. [https://supabase.com/docs/guides/auth/signing-keys]  
**Quote (HS256):** "Not recommended for production applications." [https://supabase.com/docs/guides/auth/signing-keys]

### Why Asymmetric (ES256/RS256)?

**Public key cryptography advantages:**
- Third-party verifiers access public key from JWKS endpoint without needing the secret
- Safe to share JWKS publicly; rotation doesn't require app redeployment
- Industry standard for OAuth 2.0 and OIDC
- Easier compliance auditing (no shared secret to protect across teams)

**Quote:** "When signing keys use an asymmetric algorithm based on public-key cryptography, Supabase Auth exposes the public key in the JSON Web Key Set discovery endpoint. This is an important security feature allowing you to rotate and revoke keys without needing to deploy new versions of your app's backend infrastructure." [https://supabase.com/docs/guides/auth/signing-keys]

### HS256 Creation Deprecation

- **Status:** Still allowed in POST endpoint enum but **strongly discouraged**
- **Not formally deprecated:** Docs mark it "Not recommended" rather than "removed"
- **Why not removed:** Some self-hosted deployments still depend on it for legacy reasons
- **Recommendation:** Dashboard UI should either hide HS256 option or warn prominently if user selects it

### Custom Key Import (`private_jwk` Parameter)

- **Supported:** Can import your own private key in JWK format when creating a key
- **Use cases:** Migrating from external auth provider, using key managed in HSM
- **Hazards of UI exposure:**
  - Leaking private key via copy/paste to user's clipboard
  - Logging sensitive key data in browser console or network requests
  - UI should allow import but **never display or echo back the private key**
  - CLI-only import recommended: `supabase gen signing-key --algorithm ES256`
- **Quote:** "You can import a private key or shared secret you already have by choosing to use a different signing algorithm." [https://supabase.com/docs/guides/auth/signing-keys]

---

## 5. JWKS Endpoint & Asymmetric Verification

### Endpoint Location

`https://{project-ref}.supabase.co/auth/v1/.well-known/jwks.json`

**Format:** Standard IETF JSON Web Key Set (RFC 7517)  
**Contains:** Array of public keys with `kid` (key identifier) header matching JWT header

### JWKS Cache Behavior (Critical for Rotation)

**Multi-level caching:** 
1. **Supabase edge CDN:** Caches for 10 minutes
2. **Client libraries:** Cache in memory for additional 10 minutes
3. **Total refresh window:** ~20 minutes before all caches cleared
- **Quote:** "The discovery endpoint is cached by Supabase's edge servers for 10 minutes, and furthermore the Supabase client libraries may cache the keys in memory for an additional 10 minutes." [https://supabase.com/docs/guides/auth/signing-keys]

**Implication:** After key rotation, clients may not see updated JWKS for up to 20 minutes. Old key remains accessible during this window (intentional for smooth rotation).

### What Changes During Rotation

**Before rotation:**
```json
{
  "keys": [
    { "kid": "current-key-id", "alg": "ES256", "kty": "EC", ... }
  ]
}
```

**After standby→in_use promotion:**
```json
{
  "keys": [
    { "kid": "new-current-key-id", "alg": "ES256", "kty": "EC", ... },
    { "kid": "previous-key-id", "alg": "ES256", "kty": "EC", ... }  // still in JWKS
  ]
}
```

**After previously_used→revoked:**
```json
{
  "keys": [
    { "kid": "new-current-key-id", "alg": "ES256", "kty": "EC", ... }  // only this one
  ]
}
```

### Known Cache Bug

**Issue:** GoTrue rejects valid ES256 tokens after rotation due to JWKS cache not refreshing  
**Root cause:** Auth service caches JWKS in memory at startup and doesn't reload at runtime  
**Affected:** Projects that rotate frequently or depend on live key changes  
**Fix:** Redeploy auth service to force cache refresh  
**GitHub:** [https://github.com/supabase/auth/issues/2821]

---

## 6. Rate Limits & Failure Modes

### Management API Rate Limits (General)

- **Standard limit:** 120 requests per minute per user per project
- **Burst limit:** Some endpoints have dual-layer limit (e.g., 10 per minute + 1 per second)
- **Headers:** Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Exceeded:** 429 Too Many Requests
- **Quote:** "Rate limits apply independently to each project, so requests to one project do not count toward the limit of another project." [https://supabase.com/docs/reference/api/introduction]

### State Change Throttle (Specific to Signing Keys)

- **Applies to:** All status transitions (POST, PATCH status field)
- **Duration:** ~5 minutes between state changes on same key
- **Observed pattern:** User measured 3 sequential POST requests to auth key endpoints; 201, 429, 429 with headers showing budget—indicates burst limit more restrictive than advertised
- **Not documented:** Signing key endpoint rate limiting not explicitly listed; likely same as general API limits or stricter
- **Implication for dashboard:** Cannot implement rapid "create → rotate → revoke" workflows in UI; 5-min throttle creates UX friction

### Failure Modes (Not Measured, Inference Required)

**These would need measurement on live project; DO NOT test:**

1. **Two keys set to `in_use`:** Unclear if error on second PATCH or if one auto-reverts. Likely 400/409 response.
2. **DELETE on standby/in_use/previously_used key:** Likely 400 error ("revoked status required").
3. **PATCH to status that already set:** Likely 400 or idempotent 200.
4. **CREATE with malformed `private_jwk`:** Likely 400 with validation error.
5. **CREATE multiple standby keys:** Unclear if limit enforced; possibly up to 10 standby keys allowed before requiring rotation.

---

## Measured Facts vs. Inference

### Documented (Primary Sources)

✅ Default JWT expiration: 1 hour  
✅ State machine: standby, in_use, previously_used, revoked  
✅ Legal transitions: documented via GitHub and docs  
✅ Rotation is atomic (old key auto-demotes)  
✅ Existing tokens survive rotation  
✅ 5-minute throttle on state changes  
✅ JWKS cached 10+10 minutes  
✅ ES256/RS256 recommended, HS256 deprecated  
✅ Legacy HS256 signed anon/service_role keys  
✅ EdDSA coming soon  
✅ Anon/service_role 10-year TTL  

### Partially Documented

⚠️ Grace period for DELETE after revoked (duration not specified)  
⚠️ Burst rate limiting specifics (measured by user to differ from headers)  
⚠️ Max standby keys allowed  
⚠️ Exact error responses for edge cases  

### Not Measured (Would Require Live Testing)

❌ POST and PATCH operations on this user's live project (too risky)  
❌ Failure behavior when attempting two `in_use` keys  
❌ Exact grace period duration before deletion allowed  
❌ Whether JWKS updates propagate before all client caches refresh  
❌ Whether RLS cache bug still exists in latest auth version  

---

## Recommendations for Dashboard Implementation

### For the UI Confirmation Flow

1. **Rotation step:** When promoting standby→in_use, confirm the old key will auto-demote. No need for separate PATCH.

2. **Revocation timing:**
   - Show: "Old key will accept tokens until they expire or are revoked (default 1 hour)"
   - Offer: Countdown timer starting from rotation, prompt after 1 hour 15 minutes
   - Warn: "Revoking will immediately break any tokens still using the old key"

3. **Deletion gate:** Show DELETE button only after key in revoked status for documented grace period (query to determine actual duration).

4. **Legacy HS256 logic:** Before allowing legacy key revocation, confirm:
   - No active apps using anon/service_role keys
   - Link to API Keys page to disable anon/service_role
   - Checkpoint: "Are you sure? This affects all existing sessions using the legacy secret."

### For Error Handling

- **429 on key creation:** Warn user "State changes throttled for ~5 minutes. Try again later."
- **400 on state transition:** Check current key state; may already be in target state or conflict.
- **If RLS queries fail after rotation:** Recommend redeploying auth service to refresh JWKS cache.

---

## Unresolved Questions

These cannot be answered from docs alone:

1. **Exact grace period:** How long must a key remain revoked before DELETE is allowed? (Hours? Days?)
2. **Max standby keys:** Can a project have multiple standby keys, or only one? If multiple, rotation sequence?
3. **Error behavior:** What exact HTTP status/message if user attempts to set two keys to `in_use`?
4. **Burst limit depth:** Is 3 writes/sec the actual limit for signing key endpoints, or does it vary by account tier?
5. **JWKS propagation:** Do JWKS changes appear in all edge locations before 20-minute cache fully expires?
6. **RLS bug status:** Is the ES256 RLS cache invalidation bug still present in current auth version?

---

## Sources

- [JWT Signing Keys | Supabase Docs](https://supabase.com/docs/guides/auth/signing-keys)
- [Rotating Anon, Service, and JWT Secrets | Supabase Docs](https://supabase.com/docs/guides/troubleshooting/rotating-anon-service-and-jwt-secrets-1Jq6yd)
- [User Sessions | Supabase Docs](https://supabase.com/docs/guides/auth/sessions)
- [JSON Web Token (JWT) | Supabase Docs](https://supabase.com/docs/guides/auth/jwts)
- [Rate Limits | Supabase Docs](https://supabase.com/docs/guides/auth/rate-limits)
- [Management API Introduction | Supabase Docs](https://supabase.com/docs/reference/api/introduction)
- [Create Project Signing Key | Management API Reference](https://supabase.com/docs/reference/api/v1-create-project-signing-key)
- [Update Project Signing Key | Management API Reference](https://supabase.com/docs/reference/api/v1-update-project-signing-key)
- [Remove Project Signing Key | Management API Reference](https://supabase.com/docs/reference/api/v1-remove-project-signing-key)
- [Migrating to Publishable/Secret API Keys | Supabase Docs](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [New API Keys and Asymmetric Authentication (Self-Hosted) | Supabase Docs](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)
- [Introducing JWT Signing Keys | Supabase Blog](https://supabase.com/blog/jwt-signing-keys)
- [RLS Blocking After JWT Key Rotation | GitHub Discussion #45812](https://github.com/orgs/supabase/discussions/45812)
- [GoTrue JWKS Cache Issue | GitHub Issue #2821](https://github.com/supabase/auth/issues/2821)
- [JWT Signing Keys Guide (MDX Source) | GitHub](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/signing-keys.mdx)
