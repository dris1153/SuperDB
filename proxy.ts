import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { aalClaim, needsMfaChallenge } from "@/lib/mfa-gate";
import { safeNext } from "@/lib/safe-next";

// /reset-password is deliberately absent: /auth/confirm establishes the recovery session first, so
// reaching it without one should bounce to /login.
const PUBLIC = ["/login", "/signup", "/forgot-password", "/auth"];
const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"];

/**
 * The read endpoints, which must be refused with a status rather than a redirect.
 *
 * Matched exactly rather than by prefix: `/api/projectsfoo` is a different route, and a future one
 * should not inherit this shape by accident.
 */
const isReadApi = (pathname: string) =>
  pathname === "/api/projects" || pathname.startsWith("/api/projects/");

const refuse = (status: number, reason: string) =>
  NextResponse.json({ ok: false, reason }, { status, headers: { "Cache-Control": "no-store" } });

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

  // A redirect is a new response: without the cookies getUser() may have just refreshed, the browser
  // keeps a refresh token Auth has already rotated away.
  const redirect = (url: URL) => {
    const moved = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) moved.cookies.set(cookie);
    return moved;
  };

  // getUser() revalidates the JWT against Supabase — getSession() would trust the cookie blindly.
  // A network failure or a 5xx is not a sign-out, so it gets one more try before being taken for one.
  let { data, error } = await supabase.auth.getUser();
  if (error && isAuthRetryableFetchError(error)) ({ data, error } = await supabase.auth.getUser());
  if (!data.user && error && error.name !== "AuthSessionMissingError") {
    console.warn(`[proxy] signed out for ${request.nextUrl.pathname}: ${error.name} ${error.status ?? ""} ${error.message}`);
  }
  const isPublic = PUBLIC.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data.user && !isPublic) {
    // An API answers with a status. A redirect hands `fetch` an HTML page — and because fetch
    // follows redirects, the client sees 200 with HTML in it and reports an expired session as a
    // JSON parse error. The handlers do their own `requireUser`; this only decides the shape.
    if (isReadApi(request.nextUrl.pathname)) return refuse(401, "Not authenticated");

    // The page asked for rides along as `next`, whole — keeping only its query and dropping its path
    // is how `/connections?edit=…` used to come back as `/?edit=…`.
    const asked = request.nextUrl.clone();
    asked.searchParams.delete("_rsc");
    const url = new URL("/login", request.url);
    url.searchParams.set("next", asked.pathname + asked.search);
    return redirect(url);
  }
  if (data.user && SIGNED_OUT_ONLY.includes(request.nextUrl.pathname)) {
    return redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
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
      // Same reason as the sign-in branch, one gate later: `fetch` follows a redirect, so a client
      // would receive the MFA page with a 200 on it and try to parse HTML as JSON.
      if (isReadApi(request.nextUrl.pathname)) return refuse(403, "Verify your second factor first");

      const url = request.nextUrl.clone();
      url.pathname = "/mfa";
      url.search = "";
      return redirect(url);
    }
  }

  return response;
}

export const config = {
  // Generated metadata routes have no extension, and a signed-out preview bot or manifest fetch
  // must get the image, not /login.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon/|apple-icon|opengraph-image|manifest.webmanifest|.*\.(?:svg|png|jpg|webp)$).*)",
  ],
};
