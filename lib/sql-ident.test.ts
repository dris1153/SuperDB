import assert from "node:assert/strict";
import test from "node:test";
import { clampInt, quoteIdent, quoteLiteral, quoteQualified } from "./sql-ident.ts";

test("wraps a plain name in double quotes", () => {
  assert.equal(quoteIdent("bookmarks"), '"bookmarks"');
});

test("doubles an interior double quote", () => {
  assert.equal(quoteIdent('he"llo'), '"he""llo"');
});

test("preserves case, which is the whole point of quoting", () => {
  assert.equal(quoteIdent("MyTable"), '"MyTable"');
});

test("makes a reserved word safe to use as an identifier", () => {
  assert.equal(quoteIdent("order"), '"order"');
});

test("keeps an injection attempt inside one identifier", () => {
  // Every quote in the payload is doubled, so nothing escapes the identifier and the statement
  // separator never becomes a statement separator.
  const hostile = 'x"; drop table users; --';
  const quoted = quoteIdent(hostile);
  assert.equal(quoted, '"x""; drop table users; --"');
  assert.equal(quoted.split('"').length - 1, 4); // opening, two from the doubled pair, closing
});

test("qualifies a name with its schema, quoting both halves", () => {
  assert.equal(quoteQualified("public", "bookmarks"), '"public"."bookmarks"');
});

test("qualification does not let a dotted name split into two identifiers", () => {
  assert.equal(quoteQualified("public", "a.b"), '"public"."a.b"');
});

test("quoteLiteral wraps a plain value in single quotes", () => {
  assert.equal(quoteLiteral("public"), "'public'");
});

test("quoteLiteral doubles an interior single quote", () => {
  assert.equal(quoteLiteral("O'Brien"), "'O''Brien'");
});

test("quoteLiteral keeps a classic injection inside one literal", () => {
  assert.equal(quoteLiteral("x' or '1'='1"), "'x'' or ''1''=''1'");
});

test("quoteLiteral leaves backslashes alone", () => {
  // standard_conforming_strings is on by default, so a backslash is just a character. Doubling it
  // here would corrupt values that legitimately contain one.
  assert.equal(quoteLiteral("a\\b"), "'a\\b'");
});

test("quoteLiteral rejects a NUL byte instead of mangling it", () => {
  assert.throws(() => quoteLiteral("a\0b"), /NUL/);
});

test("quoteLiteral treats the empty string as a valid literal, not null", () => {
  assert.equal(quoteLiteral(""), "''");
});

test("clampInt passes a valid integer through", () => {
  assert.equal(clampInt(100, 1, 500, 50), 100);
});

test("clampInt bounds a value to the band rather than rejecting it", () => {
  assert.equal(clampInt(9999, 1, 500, 50), 500);
  assert.equal(clampInt(-5, 1, 500, 50), 1);
});

test("clampInt coerces a numeric string", () => {
  assert.equal(clampInt("250", 1, 500, 50), 250);
});

test("clampInt falls back on anything that is not a finite integer", () => {
  for (const bad of [NaN, Infinity, -Infinity, 1.5, "abc", "", null, undefined, {}, []]) {
    assert.equal(clampInt(bad, 1, 500, 50), 50, `expected fallback for ${String(bad)}`);
  }
});

test("clampInt does not accept a number dressed up as an expression", () => {
  assert.equal(clampInt("100; drop table users", 1, 500, 50), 50);
});
