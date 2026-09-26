import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_AUTHORIZATION_PATH,
  endpointsFrom,
  oauthServerPatch,
  pickOAuthServer,
  previewAuthorizationUrl,
} from "./oauth-server.ts";

// The shape a live discovery document answered with, 2026-09-26, trimmed.
const DISCOVERY = {
  issuer: "https://abc.supabase.co/auth/v1",
  authorization_endpoint: "https://abc.supabase.co/auth/v1/oauth/authorize",
  token_endpoint: "https://abc.supabase.co/auth/v1/oauth/token",
  jwks_uri: "https://abc.supabase.co/auth/v1/.well-known/jwks.json",
  userinfo_endpoint: "https://abc.supabase.co/auth/v1/oauth/userinfo",
};

test("a project that never enabled the server reads as off, with the default path", () => {
  // Both projects read this way on 2026-09-26: path null, not absent.
  const config = pickOAuthServer(
    {
      oauth_server_enabled: false,
      oauth_server_authorization_path: null,
      oauth_server_allow_dynamic_registration: false,
      site_url: "https://example.com",
    },
    null,
  );
  assert.deepEqual(config, {
    enabled: false,
    path: DEFAULT_AUTHORIZATION_PATH,
    dynamic: false,
    siteUrl: "https://example.com",
    endpoints: null,
  });
});

test("the endpoints come from discovery, the fourth derived from the issuer", () => {
  assert.deepEqual(endpointsFrom(DISCOVERY), [
    { label: "Authorization endpoint", url: DISCOVERY.authorization_endpoint },
    { label: "Token endpoint", url: DISCOVERY.token_endpoint },
    { label: "JWKS endpoint", url: DISCOVERY.jwks_uri },
    { label: "OIDC discovery", url: "https://abc.supabase.co/auth/v1/.well-known/openid-configuration" },
  ]);
  assert.equal(endpointsFrom({ error: "nope" }), null);
  assert.equal(endpointsFrom("not json"), null);
});

test("the preview joins site URL and path without doubling the slash", () => {
  assert.equal(previewAuthorizationUrl("https://a.io/", "/oauth/consent"), "https://a.io/oauth/consent");
  assert.equal(previewAuthorizationUrl("https://a.io", "  "), `https://a.io${DEFAULT_AUTHORIZATION_PATH}`);
  assert.equal(previewAuthorizationUrl(null, "/x"), null);
});

test("a save carries all three fields, because the flag alone is refused", () => {
  const built = oauthServerPatch({ enabled: true, path: " /oauth/consent ", dynamic: false });
  assert.deepEqual(built, {
    ok: true,
    body: {
      oauth_server_enabled: true,
      oauth_server_authorization_path: "/oauth/consent",
      oauth_server_allow_dynamic_registration: false,
    },
  });
});

test("the two measured refusals are caught before sending", () => {
  assert.equal(oauthServerPatch({ enabled: true, path: "", dynamic: false }).ok, false);
  assert.equal(oauthServerPatch({ enabled: true, path: "oauth/consent", dynamic: false }).ok, false);
});

test("off with no path sends null, which the API accepts", () => {
  const built = oauthServerPatch({ enabled: false, path: "", dynamic: false });
  assert.ok(built.ok);
  assert.equal(built.body.oauth_server_authorization_path, null);
});

test("anything that is not the three fields' types is refused", () => {
  for (const input of [null, "on", { enabled: "true", path: "/x", dynamic: false }, { enabled: true, path: 1, dynamic: false }]) {
    assert.equal(oauthServerPatch(input).ok, false, JSON.stringify(input));
  }
});
