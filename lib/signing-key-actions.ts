"use server";

import { resolveProject } from "./inventory";
import { createSigningKey, deleteSigningKey, updateSigningKeyStatus } from "./mgmt-api";
import { attempt } from "./safe";
import { isKeyId, isSigningAlgorithm, type SigningAlgorithm } from "./signing-keys";
import { recordWrite } from "./write-audit";

export type KeyResult = { ok: true } | { ok: false; reason: string };

/**
 * Minting a key that signs nothing yet.
 *
 * Safe in a way the rest of this page is not: a standby issues no tokens. It *is* published in the
 * project's JWKS within about a minute, which is the point — clients cache the new public key
 * before it ever signs, so the rotation costs no failed verifications.
 *
 * The algorithm is re-checked here because this module is `"use server"`: every export is an
 * endpoint any signed-in browser can call with any string.
 */
export async function createStandbyKey(
  projectRef: string,
  algorithm: SigningAlgorithm,
): Promise<KeyResult> {
  if (!isSigningAlgorithm(algorithm)) return { ok: false, reason: "Unsupported algorithm." };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() =>
    createSigningKey(found.token, projectRef, { algorithm, status: "standby" }),
  );

  await recordWrite({
    ref: projectRef,
    what: `${algorithm} standby signing key`,
    outcome: result.ok ? "created" : `create failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Switching signing over to a standby key.
 *
 * One request. The key that was in use demotes itself to `previously_used` and stays in JWKS, so
 * every token it signed keeps verifying until it expires — measured 2026-09-25. Nobody is signed
 * out by this, which is why the confirm in front of it reassures rather than warns.
 *
 * A 429 here is the project-wide throttle on replacing the signing key, and its message names the
 * moment it lifts. `describe` in `lib/safe.ts` passes that sentence through rather than replacing
 * it with a generic one.
 */
export async function rotateToStandby(projectRef: string, id: string): Promise<KeyResult> {
  // Before anything else, and before it is written to the audit log: this string becomes part of a
  // URL path that is not escaped, so an unchecked one chooses the endpoint rather than the key.
  if (!isKeyId(id)) return { ok: false, reason: "That is not a signing key." };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateSigningKeyStatus(found.token, projectRef, id, "in_use"));

  await recordWrite({
    ref: projectRef,
    what: "JWT signing key rotation",
    outcome: result.ok ? `promoted ${id}` : `rotation failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Withdrawing a retired key.
 *
 * This is the destructive one. A `previously_used` key is still published in JWKS and still verifies
 * the tokens it signed; revoking removes it, and anyone holding an unexpired token signed by it
 * stops being authenticated at once — not at their next sign-in. The safe wait is one `jwt_exp`
 * after the rotation, which is why the part reads that value rather than assuming an hour.
 *
 * Not throttled, unlike creating or promoting a key: two revocations went through inside one
 * five-minute window. Measured 2026-09-25. The throttle guards replacing the signing key, not
 * withdrawing one.
 */
export async function revokeKey(projectRef: string, id: string): Promise<KeyResult> {
  if (!isKeyId(id)) return { ok: false, reason: "That is not a signing key." };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() =>
    updateSigningKeyStatus(found.token, projectRef, id, "revoked"),
  );

  await recordWrite({
    ref: projectRef,
    what: "JWT signing key",
    outcome: result.ok ? `revoked ${id}` : `revoke failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Removing a revoked key.
 *
 * Attempted rather than predicted. The API refuses for thirty days after the revocation and names
 * the date in its 422; computing that date here would mean storing a revocation time and doing
 * arithmetic on it, two things that can be wrong, to avoid a round trip that answers definitively.
 */
export async function deleteKey(projectRef: string, id: string): Promise<KeyResult> {
  if (!isKeyId(id)) return { ok: false, reason: "That is not a signing key." };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => deleteSigningKey(found.token, projectRef, id));

  await recordWrite({
    ref: projectRef,
    what: "JWT signing key",
    outcome: result.ok ? `deleted ${id}` : `delete failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
