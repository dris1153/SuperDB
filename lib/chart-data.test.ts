import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPoints,
  chartProblem,
  columnsOf,
  defaultChoice,
  MAX_POINTS,
  numericColumns,
  numericValue,
  scaleOf,
} from "./chart-data.ts";

test("numbers that arrive as strings are still numbers", () => {
  // numeric and bigint come back as strings: JSON cannot carry them exactly. Treating them as text
  // would decide that every count(*) and every money column is not a measurement.
  assert.equal(numericValue("42"), 42);
  assert.equal(numericValue("3.14"), 3.14);
  assert.equal(numericValue("-0.5"), -0.5);
  assert.equal(numericValue("1e3"), 1000);
  assert.equal(numericValue(" 7 "), 7);
  assert.equal(numericValue(7), 7);
});

test("things that are not measurements are not numbers", () => {
  for (const value of [null, undefined, "", "   ", "abc", "12px", true, false, {}, [], NaN, Infinity]) {
    assert.equal(numericValue(value), null, `for ${JSON.stringify(value) ?? String(value)}`);
  }
});

test("literals Postgres never emits are not numbers", () => {
  // Number() accepts all three. A column of hex ids or colour codes would otherwise be charted at
  // its base-10 value, which is a chart on the wrong column that looks perfectly fine.
  assert.equal(numericValue("0x10"), null);
  assert.equal(numericValue("0b1010"), null);
  assert.equal(numericValue("0o17"), null);
});

test("the words Infinity and NaN are text here, whatever float8 may hold", () => {
  assert.equal(numericValue("Infinity"), null);
  assert.equal(numericValue("-Infinity"), null);
  assert.equal(numericValue("NaN"), null);
});

test("a boolean column is not plotted as ones and zeroes", () => {
  const rows = [{ ok: true }, { ok: false }];
  assert.deepEqual(numericColumns(rows), []);
});

test("a column with one text value in it is not numeric", () => {
  const rows = [{ n: 1 }, { n: 2 }, { n: "n/a" }];
  assert.deepEqual(numericColumns(rows), []);
});

test("nulls do not disqualify a column", () => {
  const rows = [{ n: 1 }, { n: null }, { n: "3" }];
  assert.deepEqual(numericColumns(rows), ["n"]);
});

test("a column that is entirely null is not numeric: there is nothing in it", () => {
  assert.deepEqual(numericColumns([{ n: null }, { n: null }]), []);
});

test("columns are every key any row carries", () => {
  assert.deepEqual(columnsOf([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }]), ["a", "b", "c"]);
  assert.deepEqual(columnsOf([]), []);
});

test("the default is the first text column against the last numeric one", () => {
  const rows = [{ name: "a", count: 3 }, { name: "b", count: 5 }];
  assert.deepEqual(defaultChoice(rows), { x: "name", y: "count" });
});

test("a select * charts its aggregate, not its primary key", () => {
  // The first numeric column of an ordinary row is the id; the last is the one worth measuring.
  const rows = [{ id: 1, name: "a", price: 9 }, { id: 2, name: "b", price: 4 }];
  assert.deepEqual(defaultChoice(rows), { x: "name", y: "price" });
});

test("all-numeric results still get an axis: a year is a category", () => {
  const rows = [{ year: 2024, total: 10 }, { year: 2025, total: 12 }];
  assert.deepEqual(defaultChoice(rows), { x: "year", y: "total" });
});

test("a single numeric column charts against itself rather than against nothing", () => {
  const rows = [{ total: 10 }, { total: 12 }];
  const { x, y } = defaultChoice(rows);
  assert.equal(y, "total");
  assert.equal(x, "total");
});

test("an all-text result has no value column to offer", () => {
  const rows = [{ name: "a" }, { name: "b" }];
  assert.deepEqual(defaultChoice(rows), { x: "name", y: null });
});

test("the not-chartable cases say which one they are", () => {
  assert.equal(chartProblem([]), "No rows to chart.");
  assert.match(chartProblem([{ name: "a" }])!, /No numeric column/);
  assert.equal(chartProblem([{ n: 1 }]), null);
});

test("points keep the statement's own order", () => {
  // The query's order by is the author's answer to what order this is in; re-sorting here would
  // disagree with the grid beside it.
  const rows = [{ k: "b", v: 2 }, { k: "a", v: 1 }, { k: "c", v: 3 }];
  const { points } = buildPoints(rows, "k", "v");
  assert.deepEqual(points.map((p) => p.label), ["b", "a", "c"]);
});

test("a row whose value is not a number is dropped, not counted as zero", () => {
  const rows = [{ k: "a", v: 1 }, { k: "b", v: null }, { k: "c", v: "x" }, { k: "d", v: "4" }];
  const { points, skipped } = buildPoints(rows, "k", "v");
  assert.deepEqual(points, [{ label: "a", value: 1 }, { label: "d", value: 4 }]);
  assert.equal(skipped, 2, "so the UI can say rows were left out");
});

test("a null category keeps a label rather than becoming a blank tick", () => {
  const { points } = buildPoints([{ k: null, v: 1 }], "k", "v");
  assert.deepEqual(points, [{ label: "null", value: 1 }]);
});

test("a json category is labelled by its json, not by [object Object]", () => {
  const { points } = buildPoints([{ k: { id: 1 }, v: 2 }], "k", "v");
  assert.equal(points[0].label, '{"id":1}');
});

test("more rows than can be read are cut, and the cut is visible in the count", () => {
  const rows = Array.from({ length: MAX_POINTS + 50 }, (_, i) => ({ k: `r${i}`, v: i }));
  const { points } = buildPoints(rows, "k", "v");
  assert.equal(points.length, MAX_POINTS);
  assert.equal(points.at(-1)?.label, `r${MAX_POINTS - 1}`, "the first MAX_POINTS, in order");
});

test("charting one column against itself works", () => {
  const { points } = buildPoints([{ v: 5 }], "v", "v");
  assert.deepEqual(points, [{ label: "5", value: 5 }]);
});

test("negative values survive, so a delta can be charted", () => {
  const { points } = buildPoints([{ k: "a", v: -3 }], "k", "v");
  assert.equal(points[0].value, -3);
});

test("the scale always includes zero", () => {
  assert.deepEqual(scaleOf([{ label: "a", value: 5 }, { label: "b", value: 9 }]).bottom, 0);
  assert.deepEqual(scaleOf([{ label: "a", value: -5 }]).top, 0);
});

test("an all-zero result does not get an upside-down baseline", () => {
  // select count(*) from an empty table. With a zero span the baseline lands at the top of the
  // frame and a one-pixel bar hangs from it, which reads as a large value for a result of nothing.
  const scale = scaleOf([{ label: "a", value: 0 }]);
  assert.deepEqual(scale, { top: 1, bottom: 0, ticks: [1, 0.5, 0] });
});

test("mixed signs keep both ends", () => {
  const { top, bottom, ticks } = scaleOf([
    { label: "a", value: -4 },
    { label: "b", value: 8 },
  ]);
  assert.equal(top, 8);
  assert.equal(bottom, -4);
  assert.deepEqual(ticks, [8, 2, -4]);
});

test("ticks never repeat a number", () => {
  // A midpoint equal to an end would print the same value twice and claim a level the data has not.
  for (const points of [[{ label: "a", value: 2 }], [{ label: "a", value: -2 }]]) {
    const { ticks } = scaleOf(points);
    assert.equal(new Set(ticks).size, ticks.length, JSON.stringify(ticks));
  }
});

test("an empty point list still yields a usable scale", () => {
  assert.deepEqual(scaleOf([]), { top: 1, bottom: 0, ticks: [1, 0.5, 0] });
});
