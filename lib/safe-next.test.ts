import assert from "node:assert/strict";
import test from "node:test";
import { safeNext } from "./safe-next.ts";

test("a path on this site comes back whole", () => {
  assert.equal(safeNext("/connections?edit=44d50b71"), "/connections?edit=44d50b71");
  assert.equal(safeNext("/p/abcdefghijklmnopqrst/sql"), "/p/abcdefghijklmnopqrst/sql");
});

test("anything that would leave the site, or loop, lands on the board", () => {
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(""), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext("javascript:alert(1)"), "/");
  assert.equal(safeNext("/login?next=/login"), "/");
});
