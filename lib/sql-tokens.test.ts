import { strict as assert } from "node:assert";
import { test } from "node:test";
import { tokenizeSql, type SqlToken } from "./sql-tokens.ts";

const joined = (tokens: SqlToken[]) => tokens.map((t) => t.text).join("");
const kinds = (sql: string, kind: SqlToken["kind"]) =>
  tokenizeSql(sql).filter((t) => t.kind === kind).map((t) => t.text);

/**
 * The contract. Colour is a detail; this is a view of SQL somebody copies and runs, so every case
 * below checks the text survives before it checks anything else.
 */
const survives = (sql: string) => assert.equal(joined(tokenizeSql(sql)), sql, sql);

test("real DDL comes back exactly as it went in", () => {
  for (const sql of [
    'create table "public"."Orders" (\n  id bigint primary key generated always as identity,\n  name text not null default \'unnamed\'\n);',
    "alter table public.users enable row level security;",
    "create policy \"own rows\" on public.t using (auth.uid() = user_id);",
    "-- a comment\nselect 1;",
    "/* block\n   comment */ select 1;",
    "",
    "   ",
    "\n\n",
  ]) {
    survives(sql);
  }
});

test("a doubled quote inside a string does not end it", () => {
  const sql = "default 'it''s mine'";
  survives(sql);

  assert.deepEqual(kinds(sql, "string"), ["'it''s mine'"]);
  // If the string ended at the second quote, `s mine` would be read as words and `mine` would come
  // back as plain text outside the literal.
  assert.equal(tokenizeSql(sql).filter((t) => t.kind === "plain" && t.text.includes("mine")).length, 0);
});

test("a doubled quote inside an identifier does not end it either", () => {
  const sql = 'create table "it""s mine" (id int)';
  survives(sql);
  assert.deepEqual(kinds(sql, "quoted"), ['"it""s mine"']);
});

test("a comment containing a quote stays a comment", () => {
  const sql = "-- don't split here\nselect 'x';";
  survives(sql);

  assert.deepEqual(kinds(sql, "comment"), ["-- don't split here"]);
  assert.deepEqual(kinds(sql, "string"), ["'x'"], "the apostrophe in the comment opened nothing");
});

test("a string containing two dashes is not a comment", () => {
  const sql = "insert into t values ('a -- b');";
  survives(sql);

  assert.deepEqual(kinds(sql, "string"), ["'a -- b'"]);
  assert.equal(kinds(sql, "comment").length, 0);
});

test("an unterminated quote keeps the rest of the text", () => {
  // `tableDefinition` reports a truncated DDL as one of its states; dropping the tail would hide it.
  for (const sql of ["select 'unfinished", 'select "unfinished', "/* unfinished"]) {
    survives(sql);
  }
});

test("keywords are matched whole, and case does not matter", () => {
  assert.deepEqual(kinds("SELECT x FROM t", "keyword"), ["SELECT", "FROM"]);

  // The trap a generous keyword list walks into: a column called `table_name` or `ontology` is not
  // two keywords, and `name` is not a keyword at all.
  assert.deepEqual(kinds("select table_name, ontology, name from t", "keyword"), ["select", "from"]);
});

test("numbers are numbers and identifiers holding digits are not", () => {
  assert.deepEqual(kinds("limit 50", "number"), ["50"]);
  assert.deepEqual(kinds("default 1.5", "number"), ["1.5"]);
  assert.deepEqual(kinds("select col2 from t", "number"), [], "col2 is one identifier");
});

test("nothing is ever lost between the tokens", () => {
  // Punctuation, newlines and runs of spaces all live in plain tokens; the join above is what
  // proves it, and this is the case that would break first.
  const sql = "create table t (\n  a int,\n  b text\n);\n";
  survives(sql);
  assert.ok(joined(tokenizeSql(sql)).includes("\n  a int,"));
});
