import assert from "node:assert/strict";
import test from "node:test";
import {
  algorithmHint,
  describeAlgorithm,
  groupKeys,
  isKeyId,
  isSigningAlgorithm,
  statusBadge,
  tokenLifetime,
} from "./signing-keys.ts";
import type { SigningKey } from "./mgmt-api.ts";

const key = (over: Partial<SigningKey>): SigningKey => ({
  id: "00000000-0000-0000-0000-000000000000",
  algorithm: "ES256",
  status: "in_use",
  public_jwk: null,
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
  ...over,
});

test("groups an empty list into empty groups", () => {
  const g = groupKeys([]);
  assert.equal(g.current, null);
  assert.deepEqual(g.standby, []);
  assert.deepEqual(g.previous, []);
  assert.deepEqual(g.revoked, []);
  assert.deepEqual(g.other, []);
});

test("survives a part that failed and passed nothing", () => {
  assert.equal(groupKeys(undefined).current, null);
});

test("picks the key in use", () => {
  const g = groupKeys([key({ id: "a", status: "previously_used" }), key({ id: "b" })]);
  assert.equal(g.current?.id, "b");
  assert.equal(g.previous.length, 1);
});

test("orders retired keys newest first", () => {
  const g = groupKeys([
    key({ id: "old", status: "previously_used", algorithm: "HS256", updated_at: "2026-09-04T16:09:32+00:00" }),
    key({ id: "new", status: "previously_used", updated_at: "2026-09-25T05:59:10+00:00" }),
  ]);
  assert.deepEqual(g.previous.map((k) => k.id), ["new", "old"]);
});

test("keeps revoked keys out of the retired group", () => {
  // The distinction the whole page rests on: a previously_used key still verifies tokens, a revoked
  // one does not.
  const g = groupKeys([key({ id: "r", status: "revoked" }), key({ id: "p", status: "previously_used" })]);
  assert.deepEqual(g.revoked.map((k) => k.id), ["r"]);
  assert.deepEqual(g.previous.map((k) => k.id), ["p"]);
});

test("finds a standby", () => {
  const g = groupKeys([key({ id: "s", status: "standby", algorithm: "RS256" }), key({ id: "c" })]);
  assert.deepEqual(g.standby.map((k) => k.id), ["s"]);
  assert.equal(g.current?.id, "c");
});

test("keeps every standby, not just the first", () => {
  // Nothing measured says a project may hold only one, and a standby is published in JWKS — so one
  // this page did not draw would be a key verifying tokens while the page says it does not exist.
  const g = groupKeys([
    key({ id: "one", status: "standby", updated_at: "2026-09-20T00:00:00+00:00" }),
    key({ id: "two", status: "standby", algorithm: "RS256", updated_at: "2026-09-25T00:00:00+00:00" }),
  ]);
  assert.deepEqual(g.standby.map((k) => k.id), ["two", "one"]);
});

test("only the two creatable algorithms pass", () => {
  assert.equal(isSigningAlgorithm("ES256"), true);
  assert.equal(isSigningAlgorithm("RS256"), true);
  // In the API's enum, and refused by it with a 422.
  assert.equal(isSigningAlgorithm("EdDSA"), false);
  assert.equal(isSigningAlgorithm("HS256"), false);
  assert.equal(isSigningAlgorithm(undefined), false);
});

test("a key id that would rewrite the URL is not a key id", () => {
  assert.equal(isKeyId("29b681e0-5cf0-4916-92f5-d93b572a7846"), true);
  // `call()` does not escape the path and the URL parser resolves these at parse time, which is why
  // this check exists at all rather than being left to the API.
  assert.equal(isKeyId("../../../../../../v1/projects/aaaaaaaaaaaaaaaaaaaa/config"), false);
  assert.equal(isKeyId("29b681e0-5cf0-4916-92f5-d93b572a7846?enabled=false"), false);
  assert.equal(isKeyId(""), false);
  assert.equal(isKeyId(undefined), false);
});

test("an unreadable token lifetime is never stated as a number", () => {
  // The confirm in front of the one irreversible action here must not promise a wait it guessed.
  assert.match(tokenLifetime(null), /unknown/);
  assert.match(tokenLifetime(0), /unknown/);
});

test("token lifetimes read in the unit that suits them", () => {
  // 3600 is the default, and the one this sentence will show most often.
  assert.equal(tokenLifetime(3600), "1 hour");
  assert.equal(tokenLifetime(900), "15 minutes");
  assert.equal(tokenLifetime(60), "60 seconds");
  assert.equal(tokenLifetime(86400), "24 hours");
});

test("a lifetime that is not a whole unit rounds up, never to nearest", () => {
  // The sentence is a wait. Understating it is the error with a consequence: 5000s to the nearest
  // hour reads "1 hour", and someone who rotated seventy minutes ago would revoke on live sessions.
  assert.equal(tokenLifetime(5000), "2 hours");
  assert.equal(tokenLifetime(3601), "2 hours");
  assert.equal(tokenLifetime(121), "3 minutes");
});

test("a lifetime that is not a number is not printed as one", () => {
  // `call()` casts over JSON.parse, so nothing upstream guarantees this is a number.
  assert.match(tokenLifetime("soon" as unknown as number), /unknown/);
  assert.match(tokenLifetime(Number.NaN), /unknown/);
  assert.match(tokenLifetime(Number.POSITIVE_INFINITY), /unknown/);
});

test("algorithms read as the curve, not as the JWA name", () => {
  assert.equal(describeAlgorithm("ES256"), "ECC (P-256)");
  assert.equal(describeAlgorithm("HS256"), "Legacy HS256 (Shared Secret)");
  // No key size on RSA: an imported key could be any width and this page never sees the modulus.
  assert.equal(describeAlgorithm("RS256"), "RSA");
  // A project could hold an algorithm this app cannot create; showing its raw name beats showing
  // nothing in the column that says what a key is.
  assert.equal(describeAlgorithm("ES512"), "ES512");
});

test("statuses read as labels, not as field names", () => {
  assert.equal(statusBadge("in_use").label, "CURRENT KEY");
  assert.equal(statusBadge("previously_used").tone, "previous");
  assert.equal(statusBadge("revoked").tone, "revoked");
  assert.equal(statusBadge("something_new").label, "SOMETHING_NEW");
});

test("a status this app has never seen still puts the key somewhere", () => {
  // Otherwise a new upstream status means the page silently does not draw a key the project has.
  const g = groupKeys([key({ id: "x", status: "compromised" as never })]);
  assert.deepEqual(g.other.map((k) => k.id), ["x"]);
  assert.equal(g.current, null);
});

test("the type hint explains who can verify, not which curve", () => {
  assert.match(algorithmHint("ES256"), /public key published/);
  assert.match(algorithmHint("RS256"), /public key published/);
  assert.match(algorithmHint("HS256"), /no public half/);
  // An algorithm this app cannot create still gets the asymmetric wording, which is true of every
  // one in the API's enum except HS256.
  assert.match(algorithmHint("EdDSA"), /public key published/);
});
