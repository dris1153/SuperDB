import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyRefusal, parseSqlError, sqlErrorFromMgmt } from "./sql-error.ts";

/**
 * Verbatim from scripts/probe-query-errors.mjs against a live project, 2026-09-12. Kept exactly as
 * they arrived — the point of these two is that they are measured, not written from memory.
 */
const REFUSAL =
  "Failed to run sql query: ERROR:  25006: cannot execute CREATE TABLE in a read-only transaction\n";
const SYNTAX =
  'Failed to run sql query: ERROR:  42601: syntax error at or near "selec"\nLINE 1: selec 1\n        ^\n';

test("reads the sqlstate out of a read-only refusal", () => {
  const error = parseSqlError(REFUSAL);
  assert.equal(error.sqlstate, "25006");
  assert.equal(error.text, "cannot execute CREATE TABLE in a read-only transaction");
  assert.equal(error.line, null, "a refusal carries no position");
  assert.equal(error.column, null);
  assert.ok(isReadOnlyRefusal(error));
});

test("reads a syntax error, and it is not a refusal", () => {
  const error = parseSqlError(SYNTAX);
  assert.equal(error.sqlstate, "42601");
  assert.equal(error.text, 'syntax error at or near "selec"');
  assert.equal(isReadOnlyRefusal(error), false, "the editor must not resend this as a write");
});

test("the caret gives a 1-based column under the quoted line", () => {
  // LINE 1: selec 1
  //         ^          → the offending token starts the line
  const error = parseSqlError(SYNTAX);
  assert.equal(error.line, 1);
  assert.equal(error.column, 1);
});

test("the column survives a multi-digit line number", () => {
  // `LINE 142: ` is two characters wider than `LINE 1: `; assuming eight would report column 3.
  const message =
    'Failed to run sql query: ERROR:  42601: syntax error at or near "from"\n' +
    "LINE 142:   from\n" +
    "            ^\n";
  const error = parseSqlError(message);
  assert.equal(error.line, 142);
  assert.equal(error.column, 3, "two spaces of indent in the quoted line, so the third column");
});

test("a caret far along the line lands on the right column", () => {
  const message =
    'Failed to run sql query: ERROR:  42601: syntax error at or near "wher"\n' +
    "LINE 1: select * from t wher x = 1\n" +
    "                        ^\n";
  const error = parseSqlError(message);
  assert.equal(error.column, 17, "offset of 'wher' within the statement, 1-based");
});

test("an error with no position reports none rather than guessing", () => {
  const error = parseSqlError(
    "Failed to run sql query: ERROR:  42P01: relation \"nope\" does not exist\n",
  );
  assert.equal(error.sqlstate, "42P01");
  assert.equal(error.line, null);
  assert.equal(error.column, null);
});

test("a sqlstate with letters is read, not just digits", () => {
  assert.equal(parseSqlError("ERROR:  42P01: nope").sqlstate, "42P01");
  assert.equal(parseSqlError("ERROR:  0A000: nope").sqlstate, "0A000");
});

test("never throws, and always leaves something to render", () => {
  for (const input of ["", "   ", "something went wrong", "Failed to run sql query: "]) {
    const error = parseSqlError(input);
    assert.equal(error.sqlstate, null);
    assert.ok(error.text.length > 0, `empty text for ${JSON.stringify(input)}`);
    assert.equal(isReadOnlyRefusal(error), false);
  }
});

test("an unrecognised message keeps its own words, minus the wrapper", () => {
  const error = parseSqlError("Failed to run sql query: something unexpected\n");
  assert.equal(error.text, "something unexpected");
  assert.equal(error.sqlstate, null, "no code means fall back to always-confirm, not to a guess");
});

test("a position inside a function body is not reported as a document position", () => {
  // PL/pgSQL quotes the failing statement from inside the function under `QUERY:`. `LINE 1` there
  // means line 1 of the function body, not of what was typed in the editor.
  const error = parseSqlError(
    'Failed to run sql query: ERROR:  42883: operator does not exist: text + integer\n' +
      "QUERY:  select x + 1\n" +
      "LINE 1: select x + 1\n" +
      "                 ^\n" +
      "CONTEXT:  PL/pgSQL function f() line 3 at RETURN\n",
  );
  assert.equal(error.sqlstate, "42883");
  assert.equal(error.line, null, "nothing to underline is better than the wrong token");
  assert.equal(error.column, null);
});

test("a LINE line with no caret beneath it still reports the line", () => {
  const error = parseSqlError(
    'Failed to run sql query: ERROR:  42601: syntax error\nLINE 3: select\n',
  );
  assert.equal(error.line, 3);
  assert.equal(error.column, null);
});

/**
 * What MgmtError actually carries: `${path} → ${status} ${rawBody}`. The body is un-parsed HTTP text,
 * so Postgres's newlines are still backslash-n at this point — which is exactly what would break the
 * caret and leave `\n"}` on the end of the message shown to the user.
 */
const WRAPPED_REFUSAL =
  '/v1/projects/x/database/query/read-only → 400 {"message":"Failed to run sql query: ERROR:  25006: cannot execute CREATE TABLE in a read-only transaction\\n"}';
const WRAPPED_SYNTAX =
  '/v1/projects/x/database/query/read-only → 400 {"message":"Failed to run sql query: ERROR:  42601: syntax error at or near \\"selec\\"\\nLINE 1: selec 1\\n        ^\\n"}';

test("unwraps a refusal out of what MgmtError carries", () => {
  const error = sqlErrorFromMgmt(WRAPPED_REFUSAL);
  assert.equal(error.sqlstate, "25006");
  assert.equal(error.text, "cannot execute CREATE TABLE in a read-only transaction");
  assert.ok(isReadOnlyRefusal(error));
});

test("unwrapping recovers the caret the raw string would have hidden", () => {
  const error = sqlErrorFromMgmt(WRAPPED_SYNTAX);
  assert.equal(error.sqlstate, "42601");
  assert.equal(error.text, 'syntax error at or near "selec"');
  assert.equal(error.line, 1, "the escaped newlines are real newlines once the JSON is parsed");
  assert.equal(error.column, 1);
});

test("the unwrapped message never trails the JSON escape", () => {
  for (const wrapped of [WRAPPED_REFUSAL, WRAPPED_SYNTAX]) {
    const { text } = sqlErrorFromMgmt(wrapped);
    assert.ok(!text.includes("\\n"), `escaped newline left in: ${text}`);
    assert.ok(!text.includes('"}'), `JSON tail left in: ${text}`);
  }
});

test("a body truncated mid-JSON still yields the sqlstate", () => {
  // call() caps the message at 2000 characters, so the closing brace can be missing.
  const truncated =
    '/v1/projects/x/database/query → 400 {"message":"Failed to run sql query: ERROR:  25006: cannot exec';
  const error = sqlErrorFromMgmt(truncated);
  assert.equal(error.sqlstate, "25006", "the code survives even when the JSON does not");
  assert.ok(isReadOnlyRefusal(error), "so the run flow still knows to confirm and resend");
});

test("a message with no JSON at all is parsed as-is", () => {
  const error = sqlErrorFromMgmt("/v1/projects/x/database/query → 500 upstream unavailable");
  assert.equal(error.sqlstate, null);
  assert.ok(error.text.length > 0);
});
