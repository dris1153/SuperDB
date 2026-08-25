import assert from "node:assert/strict";
import test from "node:test";
import { normaliseTags } from "./tags.ts";

test("collapses case and whitespace variants into one tag", () => {
  assert.deepEqual(normaliseTags(["Prod", "prod ", " PROD"]), ["prod"]);
});

test("drops empty and whitespace-only entries", () => {
  assert.deepEqual(normaliseTags(["prod", "", "   ", "staging"]), ["prod", "staging"]);
});

test("preserves the order tags were added in", () => {
  assert.deepEqual(normaliseTags(["zeta", "alpha", "mid"]), ["zeta", "alpha", "mid"]);
});

test("passes an already-clean list through unchanged", () => {
  assert.deepEqual(normaliseTags(["client-a", "prod"]), ["client-a", "prod"]);
});

test("handles an empty list", () => {
  assert.deepEqual(normaliseTags([]), []);
});
