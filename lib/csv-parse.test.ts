import assert from "node:assert/strict";
import test from "node:test";
import { MAX_CSV_ROWS, parseCsv } from "./csv-parse.ts";
import { toCsv } from "./table-export.ts";

test("reads a plain file", () => {
  const { header, rows, ragged } = parseCsv("a,b\n1,2\n3,4");
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows, [
    ["1", "2"],
    ["3", "4"],
  ]);
  assert.deepEqual(ragged, []);
});

test("a quoted field may contain a comma", () => {
  assert.deepEqual(parseCsv(`a,b\n"one, two",3`).rows, [["one, two", "3"]]);
});

test("a doubled quote inside a quoted field is one quote", () => {
  assert.deepEqual(parseCsv(`a\n"she said ""hi"""`).rows, [['she said "hi"']]);
});

test("a quoted field may contain a newline", () => {
  // The case that breaks every parser written around splitting on lines first — and the one
  // `table-export.ts` produces, so this app's own export depends on it.
  const { rows, ragged } = parseCsv(`a,b\n"line one\nline two",x\n"c",y`);
  assert.deepEqual(rows, [
    ["line one\nline two", "x"],
    ["c", "y"],
  ]);
  assert.deepEqual(ragged, []);
});

test("a quoted field may contain a CRLF, kept as written", () => {
  assert.deepEqual(parseCsv('a\r\n"one\r\ntwo"\r\n').rows, [["one\r\ntwo"]]);
});

test("CRLF and LF line endings both work", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n3,4").rows, parseCsv("a,b\n1,2\n3,4").rows);
});

test("a trailing newline does not produce a phantom row", () => {
  assert.equal(parseCsv("a,b\n1,2\n").rows.length, 1);
  assert.equal(parseCsv("a,b\r\n1,2\r\n").rows.length, 1);
});

test("an unquoted empty field is null and a quoted one is an empty string", () => {
  // This is the distinction `toCsv` makes: Postgres NULL writes as nothing, an empty string writes
  // as `""`. Collapsing them here would make an export impossible to re-import unchanged.
  assert.deepEqual(parseCsv('a,b,c\n,"",x').rows, [[null, "", "x"]]);
});

test("a leading BOM does not become part of the first header", () => {
  assert.deepEqual(parseCsv("﻿a,b\n1,2").header, ["a", "b"]);
});

test("ragged rows are reported by line number rather than padded", () => {
  const { rows, ragged } = parseCsv("a,b,c\n1,2\n4,5,6\n7,8,9,10");
  assert.deepEqual(ragged, [2, 4], "1-based file lines, header included");
  assert.equal(rows[0].length, 2, "short rows keep their real length");
});

test("an empty file yields nothing at all", () => {
  assert.deepEqual(parseCsv(""), { header: [], rows: [], ragged: [] });
});

test("a quoted field that is never closed is an error, not the rest of the file", () => {
  // Left to run on, one stray quote turns every remaining line into a single value: no error, no
  // ragged line, and a preview that truncates the evidence out of sight.
  assert.throws(() => parseCsv('a,b\n1,"unclosed\n3,4\n5,6'), /line 2 is never closed/);
});

test("a blank line is a record holding one empty field, not a line that never happened", () => {
  // On one column that is a NULL row; on more it is ragged and gets reported. Skipping it made the
  // row count the confirmation shows lower than the file, with nothing to say so.
  assert.deepEqual(parseCsv("email\nx@a\n\ny@b\n").rows, [["x@a"], [null], ["y@b"]]);

  const wide = parseCsv("a,b\n1,2\n\n3,4");
  assert.deepEqual(wide.ragged, [3]);
});

test("a file that is only a newline has one unnamed column and no rows", () => {
  assert.deepEqual(parseCsv("\n"), { header: [""], rows: [], ragged: [] });
});

test("a header with no rows is a header with no rows", () => {
  const { header, rows } = parseCsv("a,b\n");
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows, []);
});

test("refuses a file with more rows than the cap, saying the cap", () => {
  const many = "a\n" + "1\n".repeat(MAX_CSV_ROWS + 1);
  // The message groups the number the way the export's own limit message does, and the separator
  // that gets used is the runtime's, so the assertion allows for any of them.
  assert.throws(() => parseCsv(many), /50[,.\s ]?000 rows/);
});

test("a file exactly at the cap is accepted", () => {
  const exact = "a\n" + "1\n".repeat(MAX_CSV_ROWS);
  assert.equal(parseCsv(exact).rows.length, MAX_CSV_ROWS);
});

// --- the round trip this phase exists to make work ---

test("a file written by the app's own export reads back unchanged", () => {
  const columns = ["id", "note", "blank", "empty", "json"];
  const rows = [
    {
      id: 1,
      note: 'a "quoted", multi\nline value',
      blank: null,
      empty: "",
      json: { a: [1, 2] },
    },
    { id: 2, note: "plain", blank: null, empty: "", json: null },
  ];

  const parsed = parseCsv(toCsv(columns, rows));
  assert.deepEqual(parsed.header, columns);
  assert.deepEqual(parsed.ragged, []);
  assert.deepEqual(parsed.rows, [
    ["1", 'a "quoted", multi\nline value', null, "", '{"a":[1,2]}'],
    ["2", "plain", null, "", null],
  ]);
});

test("a hostile value survives the round trip as data", () => {
  const hostile = `x'; drop table bookmarks; --  $$ "q" \\ ümlaut 🙂\r\n,,,`;
  const parsed = parseCsv(toCsv(["v"], [{ v: hostile }]));
  assert.deepEqual(parsed.rows, [[hostile]]);
});
