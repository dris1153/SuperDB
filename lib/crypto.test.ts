import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { open, seal } from "./crypto.ts";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");

const PAT = "sbp_0123456789abcdef0123456789abcdef01234567";

test("round-trips a token", () => {
  const { dekWrapped, cipher } = seal(PAT);
  assert.equal(open(dekWrapped, cipher), PAT);
});

test("uses a fresh data key for every secret", () => {
  const a = seal("same");
  const b = seal("same");
  assert.notEqual(a.dekWrapped, b.dekWrapped);
  assert.notEqual(a.cipher, b.cipher);
  assert.equal(open(a.dekWrapped, a.cipher), open(b.dekWrapped, b.cipher));
});

test("data keys are not interchangeable between records", () => {
  const a = seal("first");
  const b = seal("second");
  assert.throws(() => open(a.dekWrapped, b.cipher));
});

test("rejects a tampered ciphertext", () => {
  const { dekWrapped, cipher } = seal("secret");
  const [iv, tag, body] = cipher.split(".");
  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 0xff;
  assert.throws(() => open(dekWrapped, [iv, tag, flipped.toString("base64url")].join(".")));
});

test("rejects a tampered wrapped key", () => {
  const { dekWrapped, cipher } = seal("secret");
  const flipped = dekWrapped.slice(0, -2) + (dekWrapped.endsWith("A") ? "B" : "A");
  assert.throws(() => open(flipped, cipher));
});

test("rejects an unknown wrapping version", () => {
  const { dekWrapped, cipher } = seal("secret");
  assert.throws(() => open(dekWrapped.replace(/^v1\./, "v2."), cipher), /Unsupported key wrapping version/);
});

test("rejects a wrong master key", () => {
  const sealed = seal("secret");
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => open(sealed.dekWrapped, sealed.cipher));
});
