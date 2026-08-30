import assert from "node:assert/strict";
import test from "node:test";
import { toCsv, toJson } from "./table-export.ts";

const cols = ["a", "b"];

test("writes a header row from the column names", () => {
  assert.equal(toCsv(cols, []), "a,b");
});

test("quotes a field containing a comma", () => {
  assert.equal(toCsv(["a"], [{ a: "x,y" }]), 'a\r\n"x,y"');
});

test("doubles an interior quote and quotes the field", () => {
  assert.equal(toCsv(["a"], [{ a: 'he said "hi"' }]), 'a\r\n"he said ""hi"""');
});

test("quotes a field containing a newline, which is what breaks line-splitting parsers", () => {
  const csv = toCsv(["a"], [{ a: "line1\nline2" }]);
  assert.equal(csv, 'a\r\n"line1\nline2"');
  // The record spans two physical lines but is one row.
  assert.equal(csv.split("\r\n").length, 2);
});

test("quotes a field containing a carriage return", () => {
  assert.equal(toCsv(["a"], [{ a: "x\ry" }]), 'a\r\n"x\ry"');
});

test("distinguishes null from the empty string", () => {
  // Nothing at all for null, an explicit empty quoted field for "".
  assert.equal(toCsv(["a", "b"], [{ a: null, b: "" }]), 'a,b\r\n,""');
});

test("encodes an object as JSON rather than [object Object]", () => {
  assert.equal(toCsv(["a"], [{ a: { x: 1 } }]), 'a\r\n"{""x"":1}"');
});

test("writes booleans and numbers unquoted", () => {
  assert.equal(toCsv(["a", "b"], [{ a: true, b: 42 }]), "a,b\r\ntrue,42");
});

test("quotes a header that needs it", () => {
  assert.equal(toCsv(["a,b"], []), '"a,b"');
});

test("writes one line per row", () => {
  const csv = toCsv(cols, [
    { a: 1, b: 2 },
    { a: 3, b: 4 },
  ]);
  assert.equal(csv, "a,b\r\n1,2\r\n3,4");
});

test("emits a column the row does not have as empty rather than undefined", () => {
  assert.equal(toCsv(["a", "b"], [{ a: 1 }]), "a,b\r\n1,");
});

test("toJson emits an array of objects in column order", () => {
  assert.equal(toJson(["b", "a"], [{ a: 1, b: 2 }]), '[\n  {\n    "b": 2,\n    "a": 1\n  }\n]');
});

test("toJson keeps null as null, not as an empty string", () => {
  assert.equal(toJson(["a"], [{ a: null }]), '[\n  {\n    "a": null\n  }\n]');
});

test("toJson emits an empty array for no rows", () => {
  assert.equal(toJson(["a"], []), "[]");
});
