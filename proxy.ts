import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|webp)$).*)"],
};
