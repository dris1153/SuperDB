"use server";

import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

// Header-derived origins are attacker-influenced and VERCEL_URL is the deployment URL rather than the
// canonical domain, so the OAuth return address comes from configuration only.
function siteUrl(): string {
  const url = process.env.SITE_URL;
  if (!url) throw new Error("SITE_URL is not set");
  return url.replace(/\/+$/, "");
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail("/login", error.message);
  redirect("/");
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) fail("/signup", error.message);

  // With confirmations on there is no session yet. Without them there is, so handle both.
  if (data.session) redirect("/");
  redirect(`/signup?sent=${encodeURIComponent(email)}`);
}

export async function signInWithGitHub() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error || !data.url) fail("/login", error?.message ?? "Could not start GitHub sign-in");
  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  const supabase = await createClient();
  // Result deliberately ignored: an error here would reveal whether the address has an account.
  await supabase.auth.resetPasswordForEmail(email);
  redirect("/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail("/reset-password", error.message);
  redirect("/");
}
