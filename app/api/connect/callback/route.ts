import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { addOAuthConnection } from "@/lib/connections";
import { exchangeCode } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const store = await cookies();

  const url = request.nextUrl.clone();
  url.pathname = "/connections";
  url.search = "";

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = store.get("sb_oauth_state")?.value;
  const verifier = store.get("sb_oauth_verifier")?.value;

  const done = (key: "connected" | "error", value: string) => {
    store.delete("sb_oauth_state");
    store.delete("sb_oauth_verifier");
    url.searchParams.set(key, value);
    return NextResponse.redirect(url);
  };

  // A state mismatch means this callback was not started by this browser. Abort, never proceed.
  if (!state || !expectedState || state !== expectedState || !verifier) {
    return done("error", "Authorization could not be verified. Please start again.");
  }
  if (!code) {
    return done("error", params.get("error_description") ?? "Authorization was cancelled");
  }

  try {
    const org = await addOAuthConnection(await exchangeCode({ code, verifier }));
    return done("connected", org.name);
  } catch (e) {
    return done("error", e instanceof Error ? e.message : "Could not complete the connection");
  }
}
