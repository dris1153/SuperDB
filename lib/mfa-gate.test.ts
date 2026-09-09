import assert from "node:assert/strict";
import test from "node:test";
import { aalClaim, needsMfaChallenge } from "./mfa-gate.ts";

/** Builds a token whose payload segment encodes these claims, the way Supabase base64url-encodes. */
function token(claims: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const payload = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${payload}.signature`;
}

test("reads the aal claim", () => {
  assert.equal(aalClaim(token({ aal: "aal1" })), "aal1");
  assert.equal(aalClaim(token({ aal: "aal2" })), "aal2");
});

test("reads the claim regardless of payload length, so padding is handled", () => {
  // Lengths chosen to land on each of the three valid base64 remainders.
  assert.equal(aalClaim(token({ aal: "aal1", sub: "a" })), "aal1");
  assert.equal(aalClaim(token({ aal: "aal1", sub: "ab" })), "aal1");
  assert.equal(aalClaim(token({ aal: "aal1", sub: "abc" })), "aal1");
  assert.equal(aalClaim(token({ aal: "aal1", sub: "abcd" })), "aal1");
});

test("reads the claim when other claims hold non-ASCII", () => {
  assert.equal(aalClaim(token({ aal: "aal2", name: "Nguyễn Đức 日本語 🔐" })), "aal2");
});

test("returns null rather than throwing on anything unreadable", () => {
  assert.equal(aalClaim(undefined), null);
  assert.equal(aalClaim(null), null);
  assert.equal(aalClaim(""), null);
  assert.equal(aalClaim("notajwt"), null, "no payload segment");
  assert.equal(aalClaim("header..signature"), null, "empty payload segment");
  assert.equal(aalClaim("header.!!!not-base64!!!.signature"), null);
  assert.equal(aalClaim(`header.${btoa("not json")}.signature`), null);
  assert.equal(aalClaim(token({ sub: "u1" })), null, "payload without an aal claim");
  assert.equal(aalClaim(token({ aal: 2 })), null, "non-string aal claim");
});

test("challenges an enrolled user who is not yet at aal2", () => {
  assert.equal(needsMfaChallenge([{ status: "verified" }], "aal1"), true);
});

test("lets an enrolled user through once they reach aal2", () => {
  assert.equal(needsMfaChallenge([{ status: "verified" }], "aal2"), false);
});

test("fails closed when the claim is unreadable", () => {
  assert.equal(needsMfaChallenge([{ status: "verified" }], null), true);
});

test("never challenges a user with no verified factor", () => {
  assert.equal(needsMfaChallenge([{ status: "unverified" }], "aal1"), false);
  assert.equal(needsMfaChallenge([], "aal1"), false);
  assert.equal(needsMfaChallenge(undefined, "aal1"), false);
  assert.equal(needsMfaChallenge(null, "aal1"), false);
  // Cast past the required `status`: pins runtime behaviour if upstream ever sends a factor without it.
  const noStatus = [{} as { status: string }];
  assert.equal(needsMfaChallenge(noStatus, "aal1"), false, "a factor with no status is not verified");
  // The unreadable-claim path must not challenge someone who never enrolled.
  assert.equal(needsMfaChallenge(undefined, null), false);
  assert.equal(needsMfaChallenge([{ status: "unverified" }], null), false);
});

test("one verified factor is enough among several", () => {
  const factors = [{ status: "unverified" }, { status: "verified" }];
  assert.equal(needsMfaChallenge(factors, "aal1"), true);
  assert.equal(needsMfaChallenge(factors, "aal2"), false);
});
