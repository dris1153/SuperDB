import assert from "node:assert/strict";
import test from "node:test";
import { isAddressableById, isLegacy, isMasked, toRow } from "./api-keys.ts";
import type { ApiKey } from "./mgmt-api.ts";

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "k1",
  name: "default",
  type: "publishable",
  prefix: "sb_publishable_abc",
  api_key: "sb_publishable_abcdefghijklmnopqrstuvwxyz0123",
  ...over,
});

// Measured 2026-09-25: both are 41 characters. The length is the trap.
const MASKED_SECRET = "sb_secret_yo" + "·".repeat(29);
const REAL_SECRET = "sb_secret_yo" + "abcdefghijklmnopqrstuvwxyzxyz".slice(0, 29);

test("a masked secret and a real one are the same length", () => {
  // If this ever stops being true the mask test could have been a length test, and the comment
  // explaining why it is not would be confusing rather than load-bearing.
  assert.equal(MASKED_SECRET.length, REAL_SECRET.length);
  assert.equal(MASKED_SECRET.length, 41);
});

test("masking is detected by the character, not the length", () => {
  assert.equal(isMasked(MASKED_SECRET), true);
  assert.equal(isMasked(REAL_SECRET), false);
  assert.equal(isMasked(""), false);
  assert.equal(isMasked(null), false);
  assert.equal(isMasked(undefined), false);
});

test("a publishable key carries its value", () => {
  const row = toRow(key());
  assert.equal(row.value, "sb_publishable_abcdefghijklmnopqrstuvwxyz0123");
  assert.equal(row.masked, false);
});

test("the legacy anon key carries its value", () => {
  // It is what a client application embeds; the dashboard shows it with a plain Copy button.
  const row = toRow(key({ type: "legacy", name: "anon", api_key: "eyJhbGciOi.payload.sig" }));
  assert.equal(row.value, "eyJhbGciOi.payload.sig");
});

test("service_role never carries its value, even though the API sends it complete", () => {
  // The whole point. It arrives unmasked with no special permission and bypasses Row Level Security.
  const row = toRow(key({ type: "legacy", name: "service_role", api_key: "eyJhbGciOi.admin.sig" }));
  assert.equal(row.value, null);
  assert.equal(row.masked, false, "it is not masked — it is dropped");
});

test("a secret key never carries its value", () => {
  for (const api_key of [MASKED_SECRET, REAL_SECRET]) {
    const row = toRow(key({ type: "secret", name: "default", api_key }));
    assert.equal(row.value, null, `for ${isMasked(api_key) ? "masked" : "revealed"}`);
  }
});

test("a masked value is reported as masked", () => {
  assert.equal(toRow(key({ type: "secret", api_key: MASKED_SECRET })).masked, true);
});

test("description survives, and its absence is null rather than undefined", () => {
  assert.equal(toRow({ ...key(), description: "for the web app" } as ApiKey).description, "for the web app");
  assert.equal(toRow(key()).description, null);
});

test("the tabs split on type", () => {
  assert.equal(isLegacy({ type: "legacy" }), true);
  assert.equal(isLegacy({ type: "publishable" }), false);
  assert.equal(isLegacy({ type: "secret" }), false);
});

test("legacy keys are not addressable by id", () => {
  // Their id is their own name, and GET /api-keys/{id} answers 400 "id: Invalid UUID" for those.
  // Getting this wrong means the reveal button silently never works for service_role.
  assert.equal(isAddressableById("anon"), false);
  assert.equal(isAddressableById("service_role"), false);
  assert.equal(isAddressableById(""), false);
  assert.equal(isAddressableById(null), false);
});

test("the newer key types are addressable by id", () => {
  assert.equal(isAddressableById("628f43c8-1c9f-4d28-b64f-1f32cc4bc546"), true);
  assert.equal(isAddressableById("628F43C8-1C9F-4D28-B64F-1F32CC4BC546"), true);
});

test("a nearly-uuid is not a uuid", () => {
  assert.equal(isAddressableById("628f43c8-1c9f-4d28-b64f-1f32cc4bc54"), false, "too short");
  assert.equal(isAddressableById("628f43c8_1c9f_4d28_b64f_1f32cc4bc546"), false, "wrong separators");
});
