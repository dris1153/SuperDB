"use server";

import { resolveProject } from "./inventory";
import {
  AuthError,
  createUser,
  deleteFactor,
  deleteUser,
  generateLink,
  updateUser,
} from "./auth-api";
import {
  isBanDuration,
  isLinkType,
  isUserId,
  looksLikeEmail,
  type BanDuration,
  type LinkType,
} from "./auth-users";
import { recordWrite } from "./write-audit";

export type UserResult = { ok: true } | { ok: false; reason: string };

/**
 * What these do, and to whom.
 *
 * Every export here is an HTTP endpoint any signed-in browser can call with any arguments, and
 * TypeScript is erased by the time one arrives — so ids, durations and link types are re-checked at
 * runtime, ahead of the audit line. A user id reaches a URL path, which is why `isUserId` runs
 * before anything else: `..` survives `encodeURIComponent` and the URL parser resolves it before
 * the request leaves.
 *
 * These act on real people's accounts on someone's live project, so each one is recorded whether it
 * succeeded or not — `lib/write-audit.ts` explains why a failed attempt still matters.
 */
const failed = (e: unknown) =>
  e instanceof AuthError ? e.message : "Could not reach this project's auth service.";

/**
 * A 429 here is rate limiting, and saying so is the difference between advice and a shrug.
 *
 * Kept although nine admin sends in a row did not produce one: the limit exists in `/config/auth`
 * as `rate_limit_email_sent`, and a project with different settings or a custom SMTP may well hit
 * it. An unreachable branch that would otherwise print "something went wrong" is worth its lines.
 */
function reasonFor(e: unknown): string {
  if (e instanceof AuthError && e.status === 429) {
    return "This project's auth service is rate limiting email. Waiting is the only fix — there is no endpoint that reports the remaining allowance.";
  }
  return failed(e);
}

async function project(ref: string) {
  const found = await resolveProject(ref);
  return found ? ref : null;
}

export async function createProjectUser(
  projectRef: string,
  input: { email: string; password: string; autoConfirm: boolean },
): Promise<UserResult> {
  if (!looksLikeEmail(input?.email)) return { ok: false, reason: "That is not an email address." };
  if (typeof input.password !== "string" || input.password.length < 6) {
    return { ok: false, reason: "A password of at least six characters is required." };
  }
  if (!(await project(projectRef))) return { ok: false, reason: "Project not found." };

  try {
    const user = await createUser(projectRef, {
      email: input.email,
      password: input.password,
      email_confirm: input.autoConfirm === true,
    });
    await recordWrite({
      ref: projectRef,
      what: "auth user",
      outcome: `created ${user.email ?? user.id}${input.autoConfirm ? ", auto-confirmed" : ""}`,
    });
    return { ok: true };
  } catch (e) {
    await recordWrite({
      ref: projectRef,
      what: "auth user",
      outcome: `create failed: ${failed(e).slice(0, 200)}`,
    });
    return { ok: false, reason: reasonFor(e) };
  }
}

/**
 * The three mail-sending actions, which are one endpoint.
 *
 * Invite creates the user as well; magic link and recovery act on one that exists. All three spend
 * from the same small hourly allowance, so the caller states that before the button is pressed and
 * this reports a refusal as the quota rather than as a failure.
 */
export async function sendUserLink(
  projectRef: string,
  type: LinkType,
  email: string,
): Promise<UserResult> {
  if (!isLinkType(type)) return { ok: false, reason: "Unknown link type." };
  if (!looksLikeEmail(email)) return { ok: false, reason: "That is not an email address." };
  if (!(await project(projectRef))) return { ok: false, reason: "Project not found." };

  try {
    await generateLink(projectRef, type, email);
    await recordWrite({ ref: projectRef, what: `auth ${type} email`, outcome: `sent to ${email}` });
    return { ok: true };
  } catch (e) {
    await recordWrite({
      ref: projectRef,
      what: `auth ${type} email`,
      outcome: `send failed: ${failed(e).slice(0, 200)}`,
    });
    return { ok: false, reason: reasonFor(e) };
  }
}

/** Ban and lift, through the one field that does both. */
export async function setUserBan(
  projectRef: string,
  id: string,
  duration: BanDuration,
): Promise<UserResult> {
  if (!isUserId(id)) return { ok: false, reason: "That is not a user." };
  if (!isBanDuration(duration)) return { ok: false, reason: "That is not a ban duration." };
  if (!(await project(projectRef))) return { ok: false, reason: "Project not found." };

  try {
    await updateUser(projectRef, id, { ban_duration: duration });
    await recordWrite({
      ref: projectRef,
      what: "auth user",
      outcome: duration === "none" ? `lifted the ban on ${id}` : `banned ${id} for ${duration}`,
    });
    return { ok: true };
  } catch (e) {
    await recordWrite({
      ref: projectRef,
      what: "auth user",
      outcome: `ban change failed: ${failed(e).slice(0, 200)}`,
    });
    return { ok: false, reason: failed(e) };
  }
}

export async function removeUserFactor(
  projectRef: string,
  id: string,
  factorId: string,
): Promise<UserResult> {
  if (!isUserId(id)) return { ok: false, reason: "That is not a user." };
  if (!isUserId(factorId)) return { ok: false, reason: "That is not a factor." };
  if (!(await project(projectRef))) return { ok: false, reason: "Project not found." };

  try {
    await deleteFactor(projectRef, id, factorId);
    await recordWrite({ ref: projectRef, what: "auth MFA factor", outcome: `removed ${factorId}` });
    return { ok: true };
  } catch (e) {
    await recordWrite({
      ref: projectRef,
      what: "auth MFA factor",
      outcome: `removal failed: ${failed(e).slice(0, 200)}`,
    });
    return { ok: false, reason: failed(e) };
  }
}

/**
 * The irreversible one.
 *
 * The typed email is checked here as well as in the dialog: the dialog is a UI, and this is the
 * endpoint. Whether the deletion is soft or hard is unmeasured, so nothing here promises either.
 */
export async function deleteProjectUser(
  projectRef: string,
  id: string,
  typedEmail: string,
  email: string | null,
): Promise<UserResult> {
  if (!isUserId(id)) return { ok: false, reason: "That is not a user." };
  if (typeof typedEmail !== "string" || typedEmail.trim() !== (email ?? "").trim()) {
    return { ok: false, reason: "The typed address does not match this user's." };
  }
  if (!(await project(projectRef))) return { ok: false, reason: "Project not found." };

  try {
    await deleteUser(projectRef, id);
    await recordWrite({ ref: projectRef, what: "auth user", outcome: `deleted ${email ?? id}` });
    return { ok: true };
  } catch (e) {
    await recordWrite({
      ref: projectRef,
      what: "auth user",
      outcome: `delete failed: ${failed(e).slice(0, 200)}`,
    });
    return { ok: false, reason: failed(e) };
  }
}
