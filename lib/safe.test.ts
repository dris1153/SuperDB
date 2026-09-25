import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MgmtError } from "./mgmt-api.ts";
import { attempt } from "./safe.ts";

/** Mirrors what call() builds: the path, the status, then the response body verbatim. */
const thrown = (status: number, body: string) =>
  new MgmtError(status, `/v1/projects/abc/restore → ${status} ${body}`);

const reasonFor = async (error: Error) => {
  const result = await attempt(async () => {
    throw error;
  });
  assert.equal(result.ok, false);
  return result.ok ? "" : result.reason;
};

test("surfaces Supabase's own explanation for a failed write", async () => {
  // Verbatim from the API, all 299 characters of it. The earlier version of this test invented a
  // short message instead, which sailed past the 300-character cap that was truncating the real one
  // mid-JSON and reducing the toast to "Forbidden for this connection."
  const message =
    "The following organization members have reached their maximum limits for the number of active free projects within organizations where they are an administrator or owner: dris1153 (2 project limit). To continue, these users will need to either delete, pause or upgrade one or more of these projects.";
  assert.equal(message.length, 299);
  assert.equal(await reasonFor(thrown(403, JSON.stringify({ message }))), message);
});

test("an absurdly long explanation is trimmed for the toast, not dropped", async () => {
  const message = "x".repeat(5000);
  const reason = await reasonFor(thrown(400, JSON.stringify({ message })));
  assert.equal(reason.length, 400);
  assert.ok(reason.startsWith("xxx"), "still the API's words, just fewer of them");
});

test("survives quotes and commas inside the message", async () => {
  const message = `Project "design-studio" cannot be restored, try again later.`;
  assert.equal(await reasonFor(thrown(400, JSON.stringify({ message }))), message);
});

test("falls back to the status line when the body is not JSON", async () => {
  assert.equal(await reasonFor(thrown(403, "Forbidden")), "Forbidden for this connection.");
});

test("a missing OAuth scope outranks the body, since it names the fix", async () => {
  const error = new MgmtError(403, "missing required scopes (secrets:read)");
  assert.match(await reasonFor(error), /secrets:read scope\. Re-authorize/);
});

test("rate limiting is reported as temporary, not as a failure to act on", async () => {
  assert.match(await reasonFor(thrown(429, "Too Many Requests")), /rate limiting/);
});

test("a 429 that says when it lifts is shown saying so", async () => {
  // Measured 2026-09-25: the signing-key endpoints answer a throttled write with the exact moment
  // it lifts. The body outranks the sentence above, which cannot know that moment.
  const body = JSON.stringify({ message: "Please wait until 2026-09-25T06:04:10.312Z before attempting this request again." });
  assert.match(await reasonFor(thrown(429, body)), /Please wait until 2026-09-25T06:04:10/);
});

test("a platform gap over OAuth says no scope will help", async () => {
  const error = new MgmtError(401, "does not support oauth access yet");
  assert.match(await reasonFor(error), /no scope enables it/);
});
