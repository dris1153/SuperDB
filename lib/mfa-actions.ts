"use server";

import { redirect } from "next/navigation";
import { createClient, requireUser } from "./supabase/server";

export type EnrollState =
  | { step: "idle"; error?: string }
  | { step: "scan"; factorId: string; qr: string; secret: string }
  | { step: "done" };

/**
 * Every call to enroll() creates a factor, so an abandoned attempt leaves an unverified one behind.
 * Clear those first, otherwise repeated visits pile up junk the user can never see or remove.
 */
export async function startEnrollment(): Promise<EnrollState> {
  const { supabase } = await requireUser();

  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `SuperDB ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { step: "idle", error: error?.message ?? "Could not start enrollment" };

  return { step: "scan", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Returns only success or a message. The caller keeps the QR in its own state, so a mistyped code
 * leaves it on screen — re-enrolling would invalidate the secret the user has already scanned.
 */
export async function confirmEnrollment(
  factorId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await requireUser();

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return { ok: false, error: challengeError?.message ?? "Could not start the challenge" };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function removeFactor(formData: FormData) {
  const { supabase } = await requireUser();
  const factorId = String(formData.get("factorId") ?? "");
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  redirect("/settings?disabled=1");
}

/** The login gate: raises an aal1 session to aal2. */
export async function verifyChallenge(formData: FormData) {
  const supabase = await createClient();
  const code = String(formData.get("code") ?? "").trim();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) redirect("/");

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    redirect(`/mfa?error=${encodeURIComponent(challengeError?.message ?? "Challenge failed")}`);
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  });
  if (error) redirect(`/mfa?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}
