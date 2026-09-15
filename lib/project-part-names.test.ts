import assert from "node:assert/strict";
import test from "node:test";
import { isPart, PART_NAMES } from "./project-part-names.ts";

test("every listed part is recognised", () => {
  for (const name of PART_NAMES) assert.ok(isPart(name), name);
});

test("anything not on the list is not a part", () => {
  // This is the whitelist. A request naming something else is a 404 before a token is decrypted.
  for (const value of ["", " ", "Disk", "disk ", "../disk", "listProjects", "restoreProject", "query"]) {
    assert.equal(isPart(value), false, `for ${JSON.stringify(value)}`);
  }
});

test("names that would reach a write are absent", () => {
  // The readers are reads. Nothing that changes a project belongs on a list the browser can name.
  for (const dangerous of ["restore", "restoreProject", "write", "query", "api-keys?reveal=true"]) {
    assert.equal(isPart(dangerous), false, dangerous);
  }
});

test("no part name carries a flag", () => {
  // Worth pinning, but it proves nothing about what the api-keys reader returns: `reveal=false` does
  // not hide the key value. What keeps the secret server-side is the reader picking its fields, and
  // that lives in project-parts.ts, which this suite cannot import — it is server-only.
  assert.equal(PART_NAMES.some((name) => name.includes("reveal")), false);
});

test("the list has no duplicates", () => {
  assert.equal(new Set(PART_NAMES).size, PART_NAMES.length);
});
