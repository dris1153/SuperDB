import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsAvailable,
  isSizeUnit,
  s3Endpoint,
  fromBytes,
  imageTransformationOn,
  s3ProtocolOn,
  sizeProblem,
  toBytes,
} from "./storage-config.ts";
import type { StorageConfig } from "./mgmt-api.ts";

test("the default limit is read as the number a person would say", () => {
  // 52428800 is what the measured project reports, and the dashboard calls it 50 MB.
  assert.deepEqual(fromBytes(52428800), { value: 50, unit: "MB" });
  assert.equal(toBytes(50, "MB"), 52428800);
});

test("a limit that is not a whole unit stays in bytes", () => {
  // Rounding here would write back a different limit than the project has, silently.
  assert.deepEqual(fromBytes(52428801), { value: 52428801, unit: "bytes" });
  assert.deepEqual(fromBytes(1536), { value: 1536, unit: "bytes" });
});

test("units round-trip", () => {
  for (const bytes of [1024, 5 * 1024 * 1024, 2 * 1024 * 1024 * 1024]) {
    const { value, unit } = fromBytes(bytes);
    assert.equal(toBytes(value, unit), bytes);
  }
});

test("a missing features object is every flag off, not a crash", () => {
  assert.equal(imageTransformationOn(undefined), false);
  assert.equal(s3ProtocolOn({ fileSizeLimit: 0 }), false);
  assert.equal(analyticsAvailable({ fileSizeLimit: 0, features: {} }), false);
});

test("flags read from the project rather than from a plan name", () => {
  const config: StorageConfig = {
    fileSizeLimit: 52428800,
    features: { s3Protocol: { enabled: true }, icebergCatalog: { enabled: false } },
  };
  assert.equal(s3ProtocolOn(config), true);
  assert.equal(analyticsAvailable(config), false);
});

test("a size that would be saved as something else is refused", () => {
  // toBytes rounds, so these would show one limit and save another — 0.4 bytes becomes 0, and what
  // a fileSizeLimit of 0 means to Supabase is unmeasured.
  assert.match(sizeProblem(0.4, "bytes") ?? "", /Whole bytes/);
  assert.match(sizeProblem(0.1, "KB") ?? "", /Whole KB/);
  assert.match(sizeProblem(0, "MB") ?? "", /at least 1/);
  assert.match(sizeProblem(Number.NaN, "MB") ?? "", /not a size/);
  assert.equal(sizeProblem(50, "MB"), null);
});

test("a config with no limit in it does not print the word undefined", () => {
  // `call()` hands back whatever the body held, and this value is written straight back.
  assert.deepEqual(fromBytes(undefined), { value: 0, unit: "bytes" });
  assert.deepEqual(fromBytes(Number.NaN), { value: 0, unit: "bytes" });
  assert.deepEqual(fromBytes(-1), { value: 0, unit: "bytes" });
});

test("the S3 endpoint is the one the dashboard shows", () => {
  // Checked against a screenshot of the same project: nothing in the Management API returns this,
  // so it is a derived string and worth pinning.
  assert.equal(
    s3Endpoint("nnjdwpswuynozmzfaioc"),
    "https://nnjdwpswuynozmzfaioc.storage.supabase.co/storage/v1/s3",
  );
});

test("a unit the app does not have is refused rather than multiplied by undefined", () => {
  // `toBytes(50, "TB")` is NaN, which serialises to null and would be sent as the project's limit.
  assert.equal(isSizeUnit("MB"), true);
  assert.equal(isSizeUnit("TB"), false);
  assert.equal(isSizeUnit(undefined), false);
  assert.equal(isSizeUnit(5), false);
});
