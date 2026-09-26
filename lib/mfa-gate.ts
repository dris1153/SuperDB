/**
 * The MFA redirect decision, split out of proxy.ts so it can be tested.
 *
 * This replaced getAuthenticatorAssuranceLevel() to change where the factor list comes from, not to
 * save a request: called with no argument that method reads `session.user.factors` out of the cookie
 * (GoTrueClient `_getAuthenticatorAssuranceLevel`, the branch below `if (jwt)`), and a cookie only
 * updates when the token refreshes. So enrolling a factor in one browser left another browser
 * unchallenged for up to an hour. The proxy's own getUser() response is authoritative and already in
 * hand, so the gate now reads that instead and enrollment takes effect immediately.
 *
 * Reading the claim without verifying the signature is safe here and only here: getUser() has already
 * validated this session against Supabase, so the token is authenticated before its claim is read.
 * Never read a claim this way from a token that has not been through getUser() first.
 */

/** Mirrors auth-js's Factor, where `status` is required — keep it required so upstream drift breaks the build rather than the gate. */
type Factor = { status: string };

/**
 * The `aal` claim of an access token, or null when it cannot be read.
 *
 * Never throws — proxy.ts must not 500 on a mangled cookie, and a null here fails closed below.
 */
export function aalClaim(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;

  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    // Decode as UTF-8 rather than trusting atob's output directly: other claims may hold non-ASCII.
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    return typeof claims?.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}

/**
 * Whether this session must be sent to /mfa.
 *
 * Fails closed: an unreadable claim alongside a verified factor challenges rather than passes. An
 * extra challenge annoys one user; letting an unreadable token through defeats the gate.
 */
export function needsMfaChallenge(
  factors: Factor[] | null | undefined,
  currentLevel: string | null,
): boolean {
  const enrolled = (factors ?? []).some((f) => f.status === "verified");
  return enrolled && currentLevel !== "aal2";
}
