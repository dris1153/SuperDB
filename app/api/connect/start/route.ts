import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { modeEnabled } from "@/lib/connections";
import { authorizeUrl, pkce } from "@/lib/oauth";

// sameSite lax so the cookies survive the top-level redirect back from Supabase; scoped to the
// connect routes so they are not attached to anything else.
const COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/connect",
  maxAge: 600,
} as const;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/connections";
  url.search = "";

  if (!modeEnabled("oauth")) {
    url.searchParams.set("error", "OAuth connections are disabled on this instance");
    return NextResponse.redirect(url);
  }

  const { verifier, challenge } = pkce();
  const state = randomBytes(16).toString("base64url");

  const store = await cookies();
  store.set("sb_oauth_state", state, COOKIE);
  store.set("sb_oauth_verifier", verifier, COOKIE);

  return NextResponse.redirect(authorizeUrl({ state, challenge }));
}
