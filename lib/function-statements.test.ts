import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createFunctionSql, dollarQuote, dropFunctionSql, updateFunctionSql, type DbFunction } from "./function-statements.ts";
import { blankFunction, readArguments, readConfig, readFunctionSpec, specFrom } from "./function-read.ts";

const OPTS = { types: ["int4", "integer", "text", "uuid"], languages: ["plpgsql", "sql"] };

test("a body is quoted with a tag it does not contain, and nothing is added inside", () => {
  assert.equal(dollarQuote("select 1"), "$function$select 1$function$");
  assert.equal(dollarQuote("a $function$ b"), "$function1$a $function$ b$function1$");
});

test("create writes the signature, the settings and the body", () => {
  const sql = createFunctionSql(
    { ...blankFunction("public"), name: "add", args: [{ name: "a", type: "int4" }, { name: "b", type: "integer[]" }], returnType: "int4", behavior: "i", config: [{ name: "search_path", value: "''" }], definition: "BEGIN RETURN a; END;" },
    OPTS,
  );
  assert.equal(sql, [
    `create function "public"."add"("a" int4, "b" integer[])`,
    `returns int4`,
    `language "plpgsql"`,
    `immutable`,
    `security invoker`,
    `set search_path = ''`,
    `as $function$BEGIN RETURN a; END;$function$;`,
  ].join("\n"));
});

test("a procedure has no return type and no volatility", () => {
  const sql = createFunctionSql({ ...blankFunction("public"), name: "p", kind: "procedure", securityDefiner: true }, OPTS);
  assert.ok(!sql.includes("returns") && !sql.includes("volatile"));
  assert.match(sql, /security definer/);
});

test("types, languages and parameter names come from lists, not from the form", () => {
  const base = { ...blankFunction("public"), name: "f" };
  assert.throws(() => createFunctionSql({ ...base, args: [{ name: "a", type: "int4; drop table x" }] }, OPTS), /Unknown type/);
  assert.throws(() => createFunctionSql({ ...base, language: "c" }, OPTS), /not a language/);
  assert.throws(() => createFunctionSql({ ...base, config: [{ name: "x = 1; drop", value: "1" }] }, OPTS), /not a configuration parameter/);
  assert.ok(createFunctionSql({ ...base, returnType: "event_trigger" }, OPTS));
});

// The shape the catalog read answered with for SuperDB's reorder_projects, 2026-09-26.
const existing: DbFunction = {
  schema: "public", name: "reorder", kind: "function", args: "refs text[]", identity: "refs text[]", result: "void",
  language: "plpgsql", behavior: "v", securityDefiner: false, config: [{ name: "search_path", value: "''" }], definition: "BEGIN END;",
};

test("an edit replaces with the catalog's signature, then renames, then moves", () => {
  const sql = updateFunctionSql(existing, { ...specFrom(existing), definition: "BEGIN NULL; END;", name: "reorder2", schema: "private" }, OPTS).split("\n");
  assert.equal(sql[0], `create or replace function "public"."reorder"(refs text[])`);
  assert.equal(sql[1], "returns void");
  assert.equal(sql.at(-2), `alter function "public"."reorder"(refs text[]) rename to "reorder2";`);
  assert.equal(sql.at(-1), `alter function "public"."reorder2"(refs text[]) set schema "private";`);
});

test("an edit sends only what changed, and ignores a signature the browser changed", () => {
  const sql = updateFunctionSql(existing, { ...specFrom(existing), name: "renamed", args: [], returnType: "text" }, OPTS);
  assert.equal(sql, `alter function "public"."reorder"(refs text[]) rename to "renamed";`);
  assert.throws(() => updateFunctionSql(existing, specFrom(existing), OPTS), /Nothing has changed/);
});

test("drop names the identity arguments, so an overload is never the wrong one", () => {
  assert.equal(dropFunctionSql({ ...existing, kind: "procedure", identity: "IN n integer" }), `drop procedure "public"."reorder"(IN n integer);`);
});

test("stored settings come back as SQL that sets them again", () => {
  assert.deepEqual(readConfig('search_path=""'), { name: "search_path", value: "''" });
  assert.deepEqual(readConfig("search_path=public, extensions"), { name: "search_path", value: "'public', 'extensions'" });
  assert.deepEqual(readConfig("statement_timeout=5s"), { name: "statement_timeout", value: "'5s'" });
});

test("a signature reads back as rows, brackets and defaults respected", () => {
  assert.deepEqual(readArguments("a integer DEFAULT 1, b numeric(10,2), OUT c text"), [
    { name: "a", type: "integer" },
    { name: "b", type: "numeric(10,2)" },
    { name: "c", type: "text" },
  ]);
  assert.deepEqual(readArguments(""), []);
});

test("what the browser posts is checked field by field", () => {
  assert.ok(readFunctionSpec(blankFunction("public")));
  assert.equal(readFunctionSpec({ ...blankFunction("public"), kind: "trigger" }), null);
  assert.equal(readFunctionSpec({ ...blankFunction("public"), args: [{ name: 1 }] }), null);
});
