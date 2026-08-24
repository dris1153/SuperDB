import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safePath } from "@/lib/safe-path";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safePath(request.nextUrl.searchParams.get("next"));

  const url = request.nextUrl.clone();
  url.search = "";

  if (!code) {
    url.pathname = "/login";
    url.searchParams.set("error", "Missing authorization code");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    url.pathname = "/login";
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  url.pathname = next;
  return NextResponse.redirect(url);
}
