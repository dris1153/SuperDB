#!/usr/bin/env node
// Runs the Supabase OAuth authorization-code + PKCE flow once, locally, and prints the tokens.
// Throwaway tooling for the Phase 0 spike — not part of the app.
//
// 1. Register an OAuth app: Supabase Dashboard -> Organization settings -> OAuth Apps
//    Redirect URI must be exactly: http://localhost:3999/callback
// 2. Put the credentials in .env.spike.local (already gitignored by the .env*.local rule):
//      SB_CLIENT_ID=...
//      SB_CLIENT_SECRET=sb_secret_live_...
// 3. set -a; . ./.env.spike.local; set +a; node scripts/oauth-spike.mjs

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const CLIENT_ID = process.env.SB_CLIENT_ID;
const CLIENT_SECRET = process.env.SB_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3999/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set SB_CLIENT_ID and SB_CLIENT_SECRET (see the header of this file).");
  process.exit(1);
}

const b64url = (buf) => buf.toString("base64url");
const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const state = b64url(randomBytes(16));

const authorizeUrl = new URL("https://api.supabase.com/v1/oauth/authorize");
authorizeUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: "code",
  redirect_uri: REDIRECT_URI,
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
}).toString();

console.log("\nOpen this URL in a browser and approve:\n");
console.log(authorizeUrl.toString());
console.log("\nWaiting on http://localhost:3999/callback …\n");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3999");
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const finish = (msg) => {
    res.writeHead(200, { "Content-Type": "text/plain" }).end(msg);
    server.close();
  };

  if (returnedState !== state) return finish("State mismatch — aborted.");
  if (!code) return finish(`No code. Error: ${url.searchParams.get("error_description") ?? "unknown"}`);

  // Client credentials go in a Basic auth header, body is form-encoded. Both matter.
  const tokenRes = await fetch("https://api.supabase.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  const body = await tokenRes.text();
  if (!tokenRes.ok) {
    console.error(`\nToken exchange failed: ${tokenRes.status}\n${body}\n`);
    return finish("Token exchange failed — check the terminal.");
  }

  const tokens = JSON.parse(body);
  console.log("access_token :", tokens.access_token);
  console.log("refresh_token:", tokens.refresh_token ?? "(none)");
  console.log("expires_in   :", tokens.expires_in, "seconds");
  console.log("\nNow probe what it can reach:\n");
  console.log(`  SB_TOKEN='${tokens.access_token}' node scripts/probe-token.mjs\n`);
  finish("Done — check the terminal.");
});

server.listen(3999);
