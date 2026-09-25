import assert from "node:assert/strict";
import test from "node:test";
import { timeAgo } from "./format.ts";

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

test("a distance in time reads as a distance", () => {
  assert.equal(timeAgo(ago(16 * 86400)), "16 days ago");
  assert.equal(timeAgo(ago(3 * 3600)), "3 hours ago");
  assert.equal(timeAgo(ago(30)), "just now");
});

test("a timestamp slightly in the future is clock skew, not a prediction", () => {
  // Supabase's clock and this one are not the same clock, and "in 3 seconds" would read as a bug.
  assert.equal(timeAgo(new Date(Date.now() + 3000).toISOString()), "just now");
});

test("a timestamp far in the future is bad data, not freshness", () => {
  assert.equal(timeAgo(new Date(Date.now() + 86_400_000).toISOString()), "\u2014");
});

test("nothing to format is the same dash the other formatters use", () => {
  assert.equal(timeAgo(null), "\u2014");
  assert.equal(timeAgo("not a date"), "\u2014");
});
