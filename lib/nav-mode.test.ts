import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NAV_MODE,
  NAV_MODE_LABELS,
  NAV_MODES,
  navModeCookie,
  parseNavMode,
} from "./nav-mode.ts";

test("each mode round-trips", () => {
  for (const mode of NAV_MODES) assert.equal(parseNavMode(mode), mode);
});

test("anything else is the default", () => {
  // The value arrives from a cookie, which the user can write by hand.
  for (const raw of ["", "EXPANDED", "wide", "true", "1", undefined, null]) {
    assert.equal(parseNavMode(raw), DEFAULT_NAV_MODE, `for ${JSON.stringify(raw)}`);
  }
});

test("every mode has a label", () => {
  // The menu shows these; a mode added without one would render blank rather than fail.
  for (const mode of NAV_MODES) assert.equal(typeof NAV_MODE_LABELS[mode], "string");
});

test("the two narrow modes are distinguishable by name", () => {
  // Collapsed and hover are both 48px at rest, so the label is the only thing telling them apart.
  assert.notEqual(NAV_MODE_LABELS.collapsed, NAV_MODE_LABELS.hover);
});

test("the cookie carries a path and an expiry", () => {
  const cookie = navModeCookie("expanded");
  assert.match(cookie, /^superdb-nav-mode=expanded;/);
  // Without `path=/` the cookie is scoped to the route that set it, so the choice would apply on one
  // project page and not the next.
  assert.match(cookie, /path=\//);
  // A session cookie would forget on browser close, which is the sessionStorage behaviour this
  // deliberately does not have.
  assert.match(cookie, /max-age=\d+/);
  assert.match(cookie, /samesite=lax/i);
});
