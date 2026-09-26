import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ALLOW_LIST,
  isRedirectUrl,
  parseRedirectUrls,
  pickUrlConfig,
  siteUrlProblem,
  splitPasted,
  withAdded,
  withoutUrls,
} from "./auth-urls.ts";

test("the saved string reads as a tidy list, as the original parses it", () => {
  assert.deepEqual(parseRedirectUrls("http://localhost:3001/**,http://localhost:3000/**, https://a.io/cb,"), [
    "http://localhost:3001/**",
    "http://localhost:3000/**",
    "https://a.io/cb",
  ]);
  // Measured: the API keeps duplicates. The original shows each once, and so does this.
  assert.deepEqual(parseRedirectUrls("https://a.io/cb,https://a.io/cb"), ["https://a.io/cb"]);
  assert.deepEqual(parseRedirectUrls(""), []);
  assert.deepEqual(parseRedirectUrls(null), []);
});

test("only the two fields leave the config", () => {
  const picked = pickUrlConfig({ site_url: "https://x.io", uri_allow_list: "https://x.io/**", smtp_pass: "secret" });
  assert.deepEqual(picked, { siteUrl: "https://x.io", redirectUrls: ["https://x.io/**"] });
});

test("the original's URL patterns, odd corners included", () => {
  for (const ok of [
    "http://localhost:3000/**",
    "https://database.drisdev.io/auth/callback",
    "https://*.example.com",
    "https://*-team.vercel.app/**",
    "myapp://callback",
    "com.example.app://login",
    "chrome-extension://abcdef",
  ]) assert.equal(isRedirectUrl(ok), true, ok);

  for (const bad of ["example.com", "", "not a url", "https://a.io/ cb", "https://a.io,garbage", "https://a.io/cb>"]) {
    assert.equal(isRedirectUrl(bad), false, bad);
  }
});

test("a line built to make the patterns backtrack is refused in linear time", () => {
  const hostile = "a://" + "a.".repeat(1021) + "a>";
  const started = performance.now();
  const result = withAdded([], Array.from({ length: 200 }, () => hostile));
  assert.equal(result.ok, false);
  // Measured before the guard: 15.7s for this call.
  const took = performance.now() - started;
  assert.ok(took < 200, "took " + took + "ms");
});

test("a comma inside a row cannot slip a second entry, or a duplicate, past the checks", () => {
  assert.equal(withAdded(["https://a.io/cb"], ["https://b.io/cb,https://a.io/cb"]).ok, false);
});

test("a pasted block splits on whitespace and commas", () => {
  assert.deepEqual(splitPasted("https://a.io/cb\nhttps://b.io/cb, https://c.io/cb  "), [
    "https://a.io/cb",
    "https://b.io/cb",
    "https://c.io/cb",
  ]);
});

test("the Site URL is one URL, with no wildcard", () => {
  assert.equal(siteUrlProblem("https://superdb.drisdev.io"), null);
  assert.equal(siteUrlProblem("http://localhost:3000"), null);
  assert.equal(siteUrlProblem("  "), "Must have a Site URL");
  assert.equal(siteUrlProblem("https://*.example.com"), "Wildcards cannot be used in the Site URL");
  assert.equal(siteUrlProblem("https://a.io,https://b.io"), "The Site URL is a single URL");
  assert.equal(siteUrlProblem("not-a-url"), "Please provide a valid URL");
});

test("adding reports each row the original would refuse", () => {
  const existing = ["https://a.io/cb"];
  const result = withAdded(existing, ["https://b.io/cb", "https://a.io/cb", "", "example.com", "https://b.io/cb"]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.rows, [
    null,
    "URL already exists in the allow list",
    "Please provide a value",
    "Please provide a valid URL",
    "URL already exists in this list",
  ]);
  assert.equal(result.reason, "URL already exists in the allow list");
});

test("adding appends, and stops at 2 KiB in all", () => {
  assert.deepEqual(withAdded(["https://a.io/cb"], [" https://b.io/cb "]), {
    ok: true,
    list: "https://a.io/cb,https://b.io/cb",
  });

  const long = Array.from({ length: 80 }, (_, i) => `https://h${i}.example.com/cb`);
  assert.ok(long.join(",").length > MAX_ALLOW_LIST);
  const refused = withAdded([], long);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.reason, /Too many redirect URLs/);

  assert.equal(withAdded(["https://a.io/cb"], []).ok, false);
});

test("removing keeps the rest in order", () => {
  assert.equal(withoutUrls(["https://a.io/cb", "https://b.io/cb", "https://c.io/cb"], ["https://b.io/cb"]), "https://a.io/cb,https://c.io/cb");
  assert.equal(withoutUrls(["https://a.io/cb"], ["https://a.io/cb"]), "");
});
