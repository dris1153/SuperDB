import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  displayNameOf,
  isBanDuration,
  isLinkType,
  isUserId,
  looksLikeEmail,
  isBanned,
  pageCount,
  providerTypeOf,
  providersOf,
  userCount,
  type AuthUser,
} from "./auth-users.ts";

const user = (rest: Partial<AuthUser> = {}): AuthUser => ({
  id: "6d770d51-0000-0000-0000-000000000000",
  email: "someone@example.com",
  phone: null,
  created_at: "2026-09-01T10:00:00Z",
  last_sign_in_at: null,
  ...rest,
});

test("providers come from the list, or from the single one, or from neither", () => {
  assert.deepEqual(providersOf(user({ app_metadata: { providers: ["email", "google"] } })), [
    "email",
    "google",
  ]);
  assert.deepEqual(providersOf(user({ app_metadata: { provider: "email" } })), ["email"]);
  assert.deepEqual(providersOf(user({ app_metadata: { providers: [] } })), []);
  assert.deepEqual(providersOf(user()), [], "a user with no app_metadata at all");
});

test("provider type follows the providers, and says nothing when there are none", () => {
  const typeOf = (providers: string[]) => providerTypeOf(user({ app_metadata: { providers } }));

  assert.equal(typeOf(["email"]), "Basic Auth");
  assert.equal(typeOf(["email", "phone"]), "Basic Auth");
  assert.equal(typeOf(["anonymous"]), "Basic Auth");
  assert.equal(typeOf(["google"]), "OAuth");
  assert.equal(typeOf(["email", "github"]), "OAuth", "one third party is enough");
  assert.equal(typeOf(["sso:idp-id"]), "SSO", "SSO wins over everything else");
  assert.equal(typeOf([]), "—");
});

test("a display name is only taken when it is really a string", () => {
  assert.equal(displayNameOf(user({ user_metadata: { display_name: "Dris" } })), "Dris");
  assert.equal(displayNameOf(user({ user_metadata: { full_name: "Full Name" } })), "Full Name");
  assert.equal(displayNameOf(user({ user_metadata: { name: "Name" } })), "Name");

  // `user_metadata` is whatever the project put there. Rendering an object would print
  // "[object Object]" into the table.
  assert.equal(displayNameOf(user({ user_metadata: { display_name: { first: "Dris" } } })), null);
  assert.equal(displayNameOf(user({ user_metadata: { display_name: "   " } })), null);
  assert.equal(displayNameOf(user()), null);
});

test("a ban is only a ban while it is in force", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");

  assert.equal(isBanned(user({ banned_until: "2026-09-26T12:00:00Z" }), now), true);
  // GoTrue leaves the field behind after an unban rather than clearing it, so a past date is a ban
  // that has ended — showing it as banned would libel the user in their own table.
  assert.equal(isBanned(user({ banned_until: "2026-09-01T12:00:00Z" }), now), false);
  assert.equal(isBanned(user({ banned_until: null }), now), false);
  assert.equal(isBanned(user({ banned_until: "not a date" }), now), false);
});

test("pages are counted from the total, and there is always one", () => {
  assert.equal(pageCount(0), 1, "no users is still a page saying so");
  assert.equal(pageCount(null), 1, "and so is a total the headers did not carry");
  assert.equal(pageCount(50), 1);
  assert.equal(pageCount(51), 2);
  assert.equal(pageCount(100), 2);
  assert.equal(pageCount(7, 3), 3);
});

test("the total line counts in words and does not guess", () => {
  assert.equal(userCount(1), "Total: 1 user");
  assert.equal(userCount(12), "Total: 12 users");
  assert.equal(userCount(0), "Total: 0 users");
  // `x-total-count` missing is not zero users — the one it would be mistaken for.
  assert.equal(userCount(null), "Total: unknown");
});

test("a user id is checked before it becomes part of a URL path", () => {
  // `lib/auth-user-actions.ts` is "use server": every export is an endpoint any browser can call
  // with any string, and these ids are interpolated into /admin/users/{id}. A dot survives
  // encodeURIComponent and the URL parser resolves `..` before the request leaves.
  assert.equal(isUserId("6d770d51-4b1f-4c0a-9f2e-1b3c4d5e6f70"), true);
  assert.equal(isUserId("6D770D51-4B1F-4C0A-9F2E-1B3C4D5E6F70"), true, "case is not the point");

  for (const bad of [
    "../../../config",
    "6d770d51-4b1f-4c0a-9f2e-1b3c4d5e6f70/../../factors",
    "6d770d51",
    "",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isUserId(bad), false, `for ${JSON.stringify(bad)}`);
  }
});

test("an email is refused only when it plainly is not one", () => {
  assert.equal(looksLikeEmail("someone@example.com"), true);
  assert.equal(looksLikeEmail("a+tag@sub.example.co.uk"), true);

  assert.equal(looksLikeEmail("someone"), false);
  assert.equal(looksLikeEmail("someone@localhost"), false, "GoTrue wants a dotted domain");
  assert.equal(looksLikeEmail("two @spaces.com"), false);
  assert.equal(looksLikeEmail(`${"a".repeat(321)}@example.com`), false);
  assert.equal(looksLikeEmail(null), false);
});

test("ban durations are the ones GoTrue can parse, plus the lift", () => {
  assert.equal(isBanDuration("24h"), true);
  // Go durations have no unit above the hour, so a week is 168h and `7d` is a parse error.
  assert.equal(isBanDuration("168h"), true);
  assert.equal(isBanDuration("none"), true, "the unban goes through the same field");
  assert.equal(isBanDuration("7d"), false);
  assert.equal(isBanDuration("forever"), false);
  assert.equal(isBanDuration(24), false);
});

test("only the three link types that send mail are accepted", () => {
  for (const type of ["magiclink", "recovery", "invite"]) assert.equal(isLinkType(type), true);
  assert.equal(isLinkType("signup"), false);
  assert.equal(isLinkType(null), false);
});
