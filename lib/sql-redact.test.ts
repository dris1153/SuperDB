import assert from "node:assert/strict";
import test from "node:test";
import { redactSqlSecrets } from "./sql-redact.ts";

test("takes the password out of the statements that carry one", () => {
  assert.equal(
    redactSqlSecrets("alter user postgres password 'hunter2'"),
    "alter user postgres password '[redacted]'",
  );
  assert.equal(
    redactSqlSecrets("create role app login PASSWORD 'p@ss' noinherit"),
    "create role app login PASSWORD '[redacted]' noinherit",
  );
});

test("a doubled quote inside the literal does not end it early", () => {
  // 'it''s' is one literal. Stopping at the middle quote would leave `s'` — and the rest of the
  // statement — in the audit row.
  assert.equal(
    redactSqlSecrets("alter user u password 'it''s a secret' valid until 'infinity'"),
    "alter user u password '[redacted]' valid until 'infinity'",
  );
});

test("every occurrence goes, not just the first", () => {
  assert.equal(
    redactSqlSecrets("alter user a password 'x'; alter user b password 'y'"),
    "alter user a password '[redacted]'; alter user b password '[redacted]'",
  );
});

test("newlines between the keyword and the literal are still matched", () => {
  assert.equal(redactSqlSecrets("alter user u\n  password\n  'x'"), "alter user u\n  password\n  '[redacted]'");
});

test("statements with no password are returned unchanged", () => {
  for (const sql of ["select * from users", "update t set password_hash = crypt('x', gen_salt('bf'))", ""]) {
    assert.equal(redactSqlSecrets(sql), sql);
  }
});
