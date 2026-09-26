import assert from "node:assert/strict";
import test from "node:test";
import { isFresh, PROJECT_KEY_TTL_MS } from "./key-window.ts";

test("a cached project key is used for a minute and no longer", () => {
  const now = 1_790_000_000_000;
  assert.equal(PROJECT_KEY_TTL_MS, 60_000);
  assert.equal(isFresh(now, now), true);
  assert.equal(isFresh(now - 59_999, now), true);
  assert.equal(isFresh(now - 60_000, now), false);
  assert.equal(isFresh(now - 3_600_000, now), false);
});

test("a clock that went backwards does not extend the window", () => {
  const now = 1_790_000_000_000;
  // Written in the future by a skewed clock: treated as fresh, which is the safe direction — it
  // expires a minute later, rather than never.
  assert.equal(isFresh(now + 1000, now), true);
});
