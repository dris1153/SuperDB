import assert from "node:assert/strict";
import test from "node:test";
import { withPassword } from "./connection-string.ts";

const DIRECT = "postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
const POOLER =
  "postgres://postgres.abcdefghijklmnopqrst:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

test("the direct string takes the password", () => {
  assert.equal(
    withPassword(DIRECT, "hunter2"),
    "postgresql://postgres:hunter2@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
  );
});

test("the pooler's own user survives — its userinfo has a dot in it", () => {
  // postgres.{ref} is the pooler's username. A pattern that split on the first colon would eat it.
  assert.equal(
    withPassword(POOLER, "hunter2"),
    "postgres://postgres.abcdefghijklmnopqrst:hunter2@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
  );
});

test("the session pooler, which is the transaction one with a swapped port", () => {
  const session = POOLER.replace(":6543", ":5432");
  assert.ok(withPassword(session, "hunter2").endsWith(":5432/postgres"));
  assert.ok(withPassword(session, "hunter2").includes(":hunter2@"));
});

test("characters that would break the URI are encoded", () => {
  // # is the cruel one: it opens a fragment, so everything after it is dropped and the connection
  // fails with a password that looks perfectly correct on screen.
  for (const [raw, encoded] of [
    ["p@ss", "p%40ss"],
    ["p:ss", "p%3Ass"],
    ["p/ss", "p%2Fss"],
    ["p#ss", "p%23ss"],
    ["p?ss", "p%3Fss"],
    ["100%", "100%25"],
  ]) {
    assert.equal(withPassword(DIRECT, raw), DIRECT.replace("[YOUR-PASSWORD]", encoded), `for ${raw}`);
  }
});

test("substitution does not depend on what the placeholder says", () => {
  // The poolers come back verbatim from the API and what they put there is not knowable here.
  const odd = "postgres://user:whatever-they-decide-to-write@host:5432/db";
  assert.equal(withPassword(odd, "x"), "postgres://user:x@host:5432/db");
});

test("an empty password leaves the string alone", () => {
  assert.equal(withPassword(DIRECT, ""), DIRECT);
});

test("a string with no userinfo is returned unchanged", () => {
  // Better a no-op than something that looks like a connection string and is not one.
  const bare = "postgresql://db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  assert.equal(withPassword(bare, "hunter2"), bare);
});

test("only the userinfo is touched, never a later colon or at-sign", () => {
  const withAt = "postgresql://postgres:[YOUR-PASSWORD]@host:5432/postgres?options=-c%20search_path%3Da@b";
  const out = withPassword(withAt, "pw");
  assert.equal(out, "postgresql://postgres:pw@host:5432/postgres?options=-c%20search_path%3Da@b");
});
