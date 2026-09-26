import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePassword,
  MIN_PASSWORD_LENGTH,
  passwordProblem,
} from "./password-generate.ts";

test("the alphabet cannot break a connection URI", () => {
  // The whole reason for restricting it: @ : / ? # all mean something in the userinfo of a
  // postgresql:// URI, and # opens a fragment, so the connection fails while the password still
  // looks correct on screen.
  for (let i = 0; i < 200; i += 1) {
    assert.match(generatePassword(), /^[A-Za-z0-9]{16}$/, "generated a character that needs encoding");
  }
});

test("two passwords are not the same", () => {
  const seen = new Set(Array.from({ length: 50 }, () => generatePassword()));
  assert.equal(seen.size, 50);
});

test("bytes at or above the rejection ceiling are not folded onto the alphabet", () => {
  // 256 = 4*62 + 8, so bytes 248..255 would bias A-D under a plain modulo. Feed only those, then
  // a usable byte, and check nothing from the biased range reached the output.
  let call = 0;
  const random = (bytes: Uint8Array) => {
    call += 1;
    // First draw: every byte is in the rejected range. Later draws: all zero, which maps to "A".
    bytes.fill(call === 1 ? 250 : 0);
  };

  assert.equal(generatePassword(random), "A".repeat(16));
  assert.ok(call > 1, "the rejected draw did not force another");
});

test("a short password is refused, and the floor is far above the API's own", () => {
  // The API declares minLength 4 and would accept "aaaa" for an internet-reachable database.
  assert.ok(MIN_PASSWORD_LENGTH > 4);
  assert.equal(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1))?.includes("at least"), true);
  assert.equal(passwordProblem("aaaa")?.includes("at least"), true);
  assert.equal(passwordProblem(""), `A database password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
});

test("a generated password passes the check it will be validated by", () => {
  assert.equal(passwordProblem(generatePassword()), null);
});

test("a long typed password is allowed through", () => {
  // Only the floor is enforced: the API declares no maximum, and inventing one would refuse a
  // passphrase somebody deliberately chose.
  assert.equal(passwordProblem("a".repeat(200)), null);
});
