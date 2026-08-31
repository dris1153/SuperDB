import assert from "node:assert/strict";
import test from "node:test";
import { batch, buildImportRows, guessMapping, type Mapping } from "./csv-import.ts";
import { parseCsv } from "./csv-parse.ts";
import { toCsv } from "./table-export.ts";
import type { ColumnInfo } from "./table-view.ts";

const col = (
  name: string,
  short_type = "text",
  data_type = short_type,
  over: Partial<ColumnInfo> = {},
): ColumnInfo => ({
  ordinal: 0,
  name,
  short_type,
  data_type,
  nullable: true,
  default_expr: null,
  is_pk: false,
  generated: false,
  pk_pos: null,
  fk_schema: null,
  fk_table: null,
  fk_column: null,
  fk_pairs: null,
  ...over,
});

const cols = [col("id", "int4", "integer"), col("name"), col("meta", "jsonb"), col("ok", "bool")];

// --- mapping ---

test("guesses a mapping by name, ignoring case and surrounding space", () => {
  assert.deepEqual(guessMapping([" ID ", "Name", "nope"], cols), ["id", "name", null]);
});

test("a generated column is never guessed, since the write layer refuses it", () => {
  const generated = [col("shout", "text", "text", { generated: true }), col("name")];
  assert.deepEqual(guessMapping(["shout", "name"], generated), [null, "name"]);
});

test("two CSV headers cannot both claim the same column", () => {
  assert.deepEqual(guessMapping(["name", "NAME"], cols), ["name", null]);
});

test("headers that share a name stay two separate controls", () => {
  // Keyed by name, the second header overwrote the first: one control for two columns, silently
  // taking the rightmost value and dropping the other.
  const file = parseCsv("name,name\nA,B");
  const { rows } = buildImportRows(file, ["name", null], cols, { emptyAsNull: true });
  assert.deepEqual(rows, [{ name: "A" }], "the mapped position wins, not the last header of that name");
});

// --- values ---

const rowsOf = (csv: string, mapping: Mapping, emptyAsNull = true) =>
  buildImportRows(parseCsv(csv), mapping, cols, { emptyAsNull });

test("every row supplies the same columns, which is what buildInsert requires", () => {
  const { rows } = rowsOf("id,name\n1,a\n2,b", ["id", "name"]);
  assert.deepEqual(rows, [
    { id: 1, name: "a" },
    { id: 2, name: "b" },
  ]);
});

test("an unmapped CSV column is dropped and contributes nothing", () => {
  assert.deepEqual(rowsOf("id,extra\n1,x", ["id", null]).rows, [{ id: 1 }]);
});

test("nothing mapped means nothing to insert, not a row of no columns", () => {
  // A row of `{}` per line let the confirmation promise N rows and `buildInsert` then refuse the
  // lot. Reachable by clearing every control, or by a semicolon-delimited file nothing matched.
  assert.deepEqual(rowsOf("id,name\n1,a\n2,b", [null, null]).rows, []);
});

test("jsonb is parsed rather than sent as text", () => {
  // Sending the text would store a JSON *string* — measured on a live database in phase 1.
  assert.deepEqual(rowsOf('id,meta\n1,"{""a"":1}"', ["id", "meta"]).rows, [{ id: 1, meta: { a: 1 } }]);
});

test("a boolean is read the way a spreadsheet writes one", () => {
  for (const [text, expected] of [
    ["TRUE", "true"],
    ["t", "true"],
    ["Yes", "true"],
    ["1", "true"],
    ["FALSE", "false"],
    ["n", "false"],
    ["0", "false"],
  ] as const) {
    const { rows, errors } = rowsOf(`ok\n${text}`, ["ok"]);
    assert.deepEqual(errors, [], text);
    assert.deepEqual(rows, [{ ok: expected }], text);
  }
});

test("a boolean that is neither is an error naming the line and the column", () => {
  const { rows, errors } = rowsOf("ok\nmaybe", ["ok"]);
  assert.deepEqual(rows, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.equal(errors[0].column, "ok");
});

// --- empty fields, which is where an import goes quietly wrong ---

test("on a textual column an unquoted empty takes the choice and a quoted one stays a string", () => {
  const csv = 'id,name\n1,\n2,""';
  assert.deepEqual(rowsOf(csv, ["id", "name"], true).rows, [
    { id: 1, name: null },
    { id: 2, name: "" },
  ]);
  assert.deepEqual(rowsOf(csv, ["id", "name"], false).rows, [
    { id: 1, name: "" },
    { id: 2, name: "" },
  ]);
});

test("an empty field on a non-textual column is NULL, quoted or not", () => {
  // Measured live: `""` reaching an int4 fails the whole batch of 500 with no line number, and `""`
  // reaching a jsonb is accepted and stored as the JSON string `""` — silently the wrong value.
  assert.deepEqual(rowsOf('id,meta\n"","" ', ["id", "meta"]).rows, [{ id: null, meta: null }]);
  assert.deepEqual(rowsOf("id,meta\n,", ["id", "meta"], false).rows, [{ id: null, meta: null }]);
});

test("whitespace alone is empty to a number and a value to text", () => {
  // `Number("  ")` is 0, so a column of blanks used to import as a column of zeroes.
  assert.deepEqual(rowsOf('id,name\n"  ","  "', ["id", "name"]).rows, [{ id: null, name: "  " }]);
});

test("an empty field on a NOT NULL column is refused here rather than at the database", () => {
  const strict = [col("id", "int4", "integer", { nullable: false }), col("name")];
  const { rows, errors } = buildImportRows(parseCsv("id,name\n,a"), ["id", "name"], strict, {
    emptyAsNull: true,
  });
  assert.deepEqual(rows, []);
  assert.match(errors[0].message, /cannot be null/);
});

test("a NOT NULL textual column takes the empty string, never a NULL", () => {
  const strict = [col("name", "text", "text", { nullable: false })];
  // A blank line on a single-column file is one empty field, which is a row.
  assert.deepEqual(
    buildImportRows(parseCsv("name\n\n"), ["name"], strict, { emptyAsNull: true }).rows,
    [{ name: "" }],
  );
});

test("a ragged line is left out and its number reported, never padded", () => {
  // Padding a short row writes NULL over columns nobody mentioned, which is silent data loss on a
  // table whose columns have defaults.
  const { rows, skipped } = rowsOf("id,name\n1,a\n2\n3,c", ["id", "name"]);
  assert.deepEqual(skipped, [3]);
  assert.deepEqual(rows, [
    { id: 1, name: "a" },
    { id: 3, name: "c" },
  ]);
});

test("a row with a bad value is left out and does not poison the rest", () => {
  const { rows, errors } = rowsOf("id,name\n1,a\nx,b\n3,c", ["id", "name"]);
  assert.equal(errors.length, 1);
  assert.deepEqual(
    rows.map((r) => r.id),
    [1, 3],
  );
});

// --- batching ---

test("batches are the size asked for, with the remainder last", () => {
  const items = Array.from({ length: 1200 }, (_, i) => ({ i }));
  const parts = batch(items, 500);
  assert.deepEqual(
    parts.map((p) => p.length),
    [500, 500, 200],
  );
  assert.equal(parts.flat().length, 1200, "nothing is lost between batches");
});

test("a batch is also bounded by bytes, because a server action body is", () => {
  // Measured: 500 rows carrying a 2 KB column is 987 KB, and Next caps an action body at 1 MB.
  const wide = Array.from({ length: 500 }, (_, i) => ({ id: i, note: "x".repeat(2000) }));
  const parts = batch(wide, 500);
  assert.ok(parts.length > 1, "the row cap alone would have sent this as one request");
  for (const p of parts) assert.ok(JSON.stringify(p).length < 700_000);
  assert.equal(parts.flat().length, 500);
});

test("a single row larger than the budget still goes out, alone", () => {
  const huge = [{ v: "x".repeat(800_000) }, { v: "small" }];
  const parts = batch(huge, 500);
  assert.deepEqual(
    parts.map((p) => p.length),
    [1, 1],
  );
});

test("an empty list produces no batches at all", () => {
  assert.deepEqual(batch([], 500), []);
});

// --- the round trip ---

test("a file this app exported maps and reads back as the values it started from", () => {
  const source = [
    { id: 1, name: 'a "quoted", multi\nline value', meta: { a: [1, 2] }, ok: true },
    { id: 2, name: "", meta: null, ok: false },
  ];
  const csv = toCsv(["id", "name", "meta", "ok"], source);
  const file = parseCsv(csv);
  const { rows, errors, skipped } = buildImportRows(file, guessMapping(file.header, cols), cols, {
    emptyAsNull: true,
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(skipped, []);
  assert.deepEqual(rows, [
    { id: 1, name: 'a "quoted", multi\nline value', meta: { a: [1, 2] }, ok: "true" },
    { id: 2, name: "", meta: null, ok: "false" },
  ]);
});
