import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "./crypto.ts";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");

test("round-trips a token", () => {
  const pat = "sbp_0123456789abcdef0123456789abcdef01234567";
  assert.equal(decrypt(encrypt(pat)), pat);
});

test("each encryption uses a fresh IV", () => {
  const a = encrypt("same");
  const b = encrypt("same");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), decrypt(b));
});

test("rejects a tampered ciphertext", () => {
  const [iv, tag, body] = encrypt("secret").split(".");
  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 0xff;
  assert.throws(() => decrypt([iv, tag, flipped.toString("base64url")].join(".")));
});

test("rejects a wrong key", () => {
  const payload = encrypt("secret");
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decrypt(payload));
});
