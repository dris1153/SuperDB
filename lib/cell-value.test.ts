import assert from "node:assert/strict";
import test from "node:test";
import { isArrayColumn, isBoolColumn, parseValue, toText } from "./cell-value.ts";
import type { ColumnInfo } from "./table-view.ts";

const col = (short_type: string, data_type = short_type, nullable = true): ColumnInfo => ({
  ordinal: 0,
  name: "c",
  short_type,
  data_type,
  nullable,
  default_expr: null,
  is_pk: false,
  generated: false,
  pk_pos: null,
  fk_schema: null,
  fk_table: null,
  fk_column: null,
  fk_pairs: null,
});

const value = (c: ColumnInfo, text: string) => {
  const r = parseValue(c, text);
  assert.ok(!("error" in r), `expected a value, got: ${"error" in r ? r.error : ""}`);
  return r.value;
};
const error = (c: ColumnInfo, text: string) => {
  const r = parseValue(c, text);
  assert.ok("error" in r, `expected an error, got: ${JSON.stringify(r)}`);
  return r.error;
};

// --- empty ---

test("an empty field is NULL on a nullable column and an empty string otherwise", () => {
  assert.equal(value(col("text"), ""), null);
  assert.equal(value(col("text", "text", false), ""), "");
});

// --- json ---

test("json is parsed, so the object is stored rather than a JSON string of it", () => {
  // Measured: sending the *text* `{"a":1}` to a jsonb target stored jsonb_typeof = string.
  assert.deepEqual(value(col("jsonb"), '{"a":1}'), { a: 1 });
  assert.deepEqual(value(col("json"), "[1,2]"), [1, 2]);
});

test("json that will not parse is refused rather than sent", () => {
  assert.match(error(col("jsonb"), "{a:1}"), /not valid JSON/);
});

// --- arrays ---

test("an array column is recognised from format_type, not the typname convention", () => {
  assert.equal(isArrayColumn(col("_text", "text[]")), true);
  assert.equal(isArrayColumn(col("_status", "status")), false, "a type merely named with _");
  assert.equal(isArrayColumn(col("text", "text")), false);
});

test("an array takes a JSON array, which is how a non-wide array column reads back", () => {
  // int4[] is not wide, so `table-rows.ts` selects it raw and it arrives as a real JS array.
  assert.deepEqual(value(col("_int4", "integer[]"), "[1,2,3]"), [1, 2, 3]);
  assert.deepEqual(value(col("_int4", "integer[]"), "[]"), []);
  assert.deepEqual(value(col("_int4", "integer[]"), "[[1,2],[3,4]]"), [
    [1, 2],
    [3, 4],
  ]);
});

test("an array also takes a Postgres literal, which is how a wide array column reads back", () => {
  // text[] *is* wide, so it is cast to text and arrives as `{urgent,billing}`. Refusing that made
  // every text[] column uneditable while int4[] worked — the two halves must both round-trip.
  assert.equal(value(col("_text", "text[]"), "{urgent,archived}"), "{urgent,archived}");
  assert.equal(value(col("_text", "text[]"), "{}"), "{}");
});

// --- bool ---

test("a boolean takes only the two forms its control can show", () => {
  assert.equal(value(col("bool"), "true"), "true");
  assert.equal(value(col("bool"), "false"), "false");
  // jsonb_to_record would coerce all of these to true, while the confirmation's switch — bound to
  // `value === "true"` — would show false. The dialog would display the opposite of the write.
  for (const text of ["TRUE", "t", "yes", "1", "on"]) {
    assert.match(error(col("bool"), text), /use true or false/, text);
  }
  assert.equal(isBoolColumn(col("bool")), true);
});

// --- numbers ---

test("a number goes as a JSON number, and one too large for a double stays text", () => {
  assert.equal(value(col("int4"), "42"), 42);
  assert.equal(value(col("numeric"), "1.5"), 1.5);
  // Rounding this to look tidy would be data loss; Postgres parses int8 from a string.
  assert.equal(value(col("int8"), "9223372036854775807"), "9223372036854775807");
  assert.match(error(col("int4"), "twelve"), /expects a number/);
});

// --- text and display ---

test("text passes through untouched, quotes and all", () => {
  assert.equal(value(col("text"), "x'; drop table t; --"), "x'; drop table t; --");
});

test("toText shows NULL as empty and an object as indented JSON", () => {
  assert.equal(toText(null), "");
  assert.equal(toText(undefined), "");
  assert.equal(toText(false), "false");
  assert.equal(toText({ a: 1 }), '{\n  "a": 1\n}');
});
