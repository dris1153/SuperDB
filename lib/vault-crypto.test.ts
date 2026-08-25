import assert from "node:assert/strict";
import test from "node:test";
import {
  createVault,
  decryptJson,
  decryptString,
  encryptJson,
  encryptString,
  unlockVault,
  WrongMasterPassword,
} from "./vault-crypto.ts";

// The real 600,000 would make this suite take minutes. Iterations are a stored per-vault parameter,
// so lowering them here exercises exactly the same code path.
const FAST = 1_000;

test("round-trips a credential", async () => {
  const { key } = await createVault("correct horse battery staple", FAST);
  const secret = { supabase_password: "hunter2", provider_password: "s3cr3t" };
  assert.deepEqual(await decryptJson(key, await encryptJson(key, secret)), secret);
});

test("unlocks with the right master password", async () => {
  const { params, checkBlob, key } = await createVault("right", FAST);
  const blob = await encryptString(key, "value");

  const reopened = await unlockVault("right", params, checkBlob);
  assert.equal(await decryptString(reopened, blob), "value");
});

test("rejects a wrong master password as such, not as corruption", async () => {
  const { params, checkBlob } = await createVault("right", FAST);
  await assert.rejects(() => unlockVault("wrong", params, checkBlob), WrongMasterPassword);
});

test("a different salt yields a different key from the same password", async () => {
  const a = await createVault("same", FAST);
  const b = await createVault("same", FAST);
  assert.notEqual(a.params.salt, b.params.salt);
  await assert.rejects(() => unlockVault("same", a.params, b.checkBlob), WrongMasterPassword);
});

test("uses a fresh IV for every encryption", async () => {
  const { key } = await createVault("pw", FAST);
  const first = await encryptString(key, "same");
  const second = await encryptString(key, "same");
  assert.notEqual(first, second);
  assert.equal(await decryptString(key, first), await decryptString(key, second));
});

test("rejects a tampered ciphertext", async () => {
  const { key } = await createVault("pw", FAST);
  const [iv, body] = (await encryptString(key, "secret")).split(".");
  const flipped = body.startsWith("A") ? `B${body.slice(1)}` : `A${body.slice(1)}`;
  await assert.rejects(() => decryptString(key, `${iv}.${flipped}`));
});

test("rejects a malformed blob", async () => {
  const { key } = await createVault("pw", FAST);
  await assert.rejects(() => decryptString(key, "not-a-blob"), /Malformed vault blob/);
});

test("keys are non-extractable", async () => {
  const { key } = await createVault("pw", FAST);
  assert.equal(key.extractable, false);
  await assert.rejects(() => crypto.subtle.exportKey("raw", key));
});
