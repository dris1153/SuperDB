import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { aalClaim, needsMfaChallenge } from "@/lib/mfa-gate";

// /reset-password is deliberately absent: /auth/confirm establishes the recovery session first, so
// reaching it without one should bounce to /login.
const PUBLIC = ["/login", "/signup", "/forgot-password", "/auth"];
const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() revalidates the JWT against Supabase — getSession() would trust the cookie blindly.
  const { data } = await supabase.auth.getUser();
  const isPublic = PUBLIC.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (data.user && SIGNED_OUT_ONLY.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Only users who actually enrolled a factor are sent here, so MFA stays opt-in per account. /mfa
  // and /auth/* stay reachable, otherwise someone mid-challenge could neither verify nor sign out.
  //
  // Factors come from getUser() above, not from the session: getAuthenticatorAssuranceLevel() reads
  // session.user.factors out of the cookie, which lags enrollment until the token refreshes. Keep it
  // that way — reading them off `session` would restore that gap and still pass every test.
  // getSession() supplies only the access token for the aal claim; it normally reads the cookie
  // without a request, and runs after getUser() so any refresh has already landed.
  if (data.user && !request.nextUrl.pathname.startsWith("/mfa") && !isPublic) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (needsMfaChallenge(data.user.factors, aalClaim(session?.access_token))) {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|webp)$).*)"],
};
