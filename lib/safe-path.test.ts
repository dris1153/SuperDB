import assert from "node:assert/strict";
import test from "node:test";
import { safePath } from "./safe-path.ts";

test("keeps ordinary internal paths", () => {
  assert.equal(safePath("/"), "/");
  assert.equal(safePath("/accounts"), "/accounts");
  assert.equal(safePath("/p/abcdefghijklmnopqrst"), "/p/abcdefghijklmnopqrst");
});

test("rejects off-site destinations", () => {
  assert.equal(safePath("//evil.com"), "/");
  assert.equal(safePath("https://evil.com"), "/");
  assert.equal(safePath("http://evil.com/x"), "/");
  assert.equal(safePath("/\\evil.com"), "/");
});

test("rejects anything carrying a query, fragment or escape", () => {
  assert.equal(safePath("/x?next=//evil.com"), "/");
  assert.equal(safePath("/x#@evil.com"), "/");
  assert.equal(safePath("/x%2f%2fevil.com"), "/");
});

test("falls back on empty input", () => {
  assert.equal(safePath(null), "/");
  assert.equal(safePath(undefined), "/");
  assert.equal(safePath(""), "/");
});
