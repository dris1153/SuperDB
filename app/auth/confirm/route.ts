import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Reached from the links in Supabase's email templates, which must be edited to point here:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
// The stock {{ .ConfirmationURL }} does not work with this flow.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const url = request.nextUrl.clone();
  url.search = "";

  if (!tokenHash || !type) {
    url.pathname = "/login";
    url.searchParams.set("error", "Invalid or incomplete confirmation link");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    url.pathname = "/login";
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  url.pathname = type === "recovery" ? "/reset-password" : "/";
  return NextResponse.redirect(url);
}
