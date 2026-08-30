import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CELL_CHARS,
  fkTarget,
  isTruncated,
  orderClause,
  parseSort,
  serialiseSort,
} from "./table-view.ts";
import type { ColumnInfo } from "./table-view.ts";

// --- truncation ---

test("recognises a value the database shortened", () => {
  assert.equal(isTruncated("a".repeat(MAX_CELL_CHARS) + "…"), true);
});

test("recognises one shortened to 512 characters of which some are astral", () => {
  // `left()` counts code points; `String.length` counts UTF-16 units. Measured against a live
  // database: this exact prefix arrives with `.length === 813`, so a length test in units misses it
  // and the shortened value becomes editable — and writable back over the real one.
  const cut = "🙂".repeat(256) + "a".repeat(MAX_CELL_CHARS - 256);
  assert.equal([...cut].length, MAX_CELL_CHARS);
  assert.notEqual(cut.length, MAX_CELL_CHARS);
  assert.equal(isTruncated(cut + "…"), true);
});

test("a value that merely ends in an ellipsis is not truncated", () => {
  assert.equal(isTruncated("short…"), false);
  assert.equal(isTruncated("a".repeat(MAX_CELL_CHARS + 1)), false);
  assert.equal(isTruncated(null), false);
});

test("parses a single sort key", () => {
  assert.deepEqual(parseSort("id.asc"), [{ column: "id", dir: "asc" }]);
});

test("parses several keys in order", () => {
  assert.deepEqual(parseSort("id.asc,name.desc"), [
    { column: "id", dir: "asc" },
    { column: "name", dir: "desc" },
  ]);
});

test("splits on the last dot, so a dotted column name survives", () => {
  assert.deepEqual(parseSort("a.b.desc"), [{ column: "a.b", dir: "desc" }]);
});

test("drops entries with an unknown direction rather than guessing", () => {
  assert.deepEqual(parseSort("id.sideways"), []);
  assert.deepEqual(parseSort("id.asc,name.sideways"), [{ column: "id", dir: "asc" }]);
});

test("drops entries with no column", () => {
  assert.deepEqual(parseSort(".asc"), []);
  assert.deepEqual(parseSort("id"), []);
});

test("handles empty, null and undefined", () => {
  assert.deepEqual(parseSort(""), []);
  assert.deepEqual(parseSort(null), []);
  assert.deepEqual(parseSort(undefined), []);
});

test("round-trips through serialise", () => {
  const keys = [
    { column: "id", dir: "asc" as const },
    { column: "created_at", dir: "desc" as const },
  ];
  assert.deepEqual(parseSort(serialiseSort(keys)), keys);
});

test("serialises an empty list to an empty string", () => {
  assert.equal(serialiseSort([]), "");
});

// orderClause tests
/** `pkPos` is the 1-based position in the primary key constraint, or null for a non-key column. */
const mockColumn = (name: string, pkPos: number | null = null, short_type = "int"): ColumnInfo => ({
  ordinal: 0,
  name,
  short_type,
  data_type: short_type,
  nullable: false,
  default_expr: null,
  is_pk: pkPos != null,
  generated: false,
  pk_pos: pkPos,
  fk_schema: null,
  fk_table: null,
  fk_column: null,
  fk_pairs: null,
});

test("orderClause: empty column list returns empty string", () => {
  assert.equal(orderClause([], []), "");
});

test("orderClause: single PK column gets default ordering", () => {
  const cols = [mockColumn("id", 1)];
  assert.equal(orderClause(cols, []), ' order by "id" asc');
});

test("orderClause: composite PK preserves all PK columns in order", () => {
  const cols = [mockColumn("tenant_id", 1), mockColumn("id", 2), mockColumn("name")];
  assert.equal(orderClause(cols, []), ' order by "tenant_id" asc, "id" asc');
});

test("orderClause: PK order follows the constraint, not the column order", () => {
  // `primary key (b, a)` where `a` comes first in the table. Ordering by attnum would emit a, b and
  // stop Postgres from walking the primary key index.
  const cols = [mockColumn("a", 2), mockColumn("b", 1)];
  assert.equal(orderClause(cols, []), ' order by "b" asc, "a" asc');
});

test("orderClause: no PK falls back to first column", () => {
  const cols = [mockColumn("name"), mockColumn("email")];
  assert.equal(orderClause(cols, []), ' order by "name" asc');
});

test("orderClause: requested sort comes first, PK tiebreaks", () => {
  const cols = [mockColumn("name"), mockColumn("id", 1), mockColumn("created")];
  const sort = [{ column: "created", dir: "desc" as const }];
  assert.equal(orderClause(cols, sort), ' order by "created" desc, "id" asc');
});

test("orderClause: composite PK tiebreaks preserve all PK columns", () => {
  const cols = [mockColumn("tenant_id", 1), mockColumn("id", 2), mockColumn("name")];
  const sort = [{ column: "name", dir: "desc" as const }];
  assert.equal(
    orderClause(cols, sort),
    ' order by "name" desc, "tenant_id" asc, "id" asc',
  );
});

test("orderClause: sort naming non-existent column is ignored", () => {
  const cols = [mockColumn("id", 1), mockColumn("name")];
  const sort = [
    { column: "nonexistent", dir: "asc" as const },
    { column: "name", dir: "desc" as const },
  ];
  assert.equal(orderClause(cols, sort), ' order by "name" desc, "id" asc');
});

test("orderClause: multiple requested sorts maintain order", () => {
  const cols = [mockColumn("created"), mockColumn("name"), mockColumn("id", 1)];
  const sort = [
    { column: "created", dir: "desc" as const },
    { column: "name", dir: "asc" as const },
  ];
  assert.equal(orderClause(cols, sort), ' order by "created" desc, "name" asc, "id" asc');
});

test("orderClause: PK in sort list prevents duplicate in tiebreaker", () => {
  const cols = [mockColumn("id", 1), mockColumn("created")];
  const sort = [{ column: "id", dir: "desc" as const }];
  assert.equal(orderClause(cols, sort), ' order by "id" desc');
});

test("orderClause: quotes column names with special characters", () => {
  const cols = [mockColumn('column"with"quotes', 1)];
  assert.equal(orderClause(cols, []), ' order by "column""with""quotes" asc');
});

test("orderClause: quotes dotted column names safely", () => {
  const cols = [mockColumn("schema.table", 1)];
  assert.equal(orderClause(cols, []), ' order by "schema.table" asc');
});

// --- foreign key target ---
const fkCol = (name: string, s: string | null, t: string | null, c: string | null): ColumnInfo => ({
  ...mockColumn(name),
  fk_schema: s,
  fk_table: t,
  fk_column: c,
  fk_pairs: c ? [{ local: name, remote: c }] : null,
});

test("fkTarget returns the target and the full pair list", () => {
  assert.deepEqual(fkTarget(fkCol("user_id", "auth", "users", "id")), {
    schema: "auth",
    table: "users",
    column: "id",
    pairs: [{ local: "user_id", remote: "id" }],
  });
});

test("fkTarget refuses a target with no pairs — a composite key needs every column", () => {
  // Filtering the referenced table on one column of a two-column key returns a row set, not a row.
  assert.equal(fkTarget({ ...fkCol("a", "public", "t", "id"), fk_pairs: null }), null);
  assert.equal(fkTarget({ ...fkCol("a", "public", "t", "id"), fk_pairs: [] }), null);
});

test("fkTarget is null for a column with no foreign key", () => {
  assert.equal(fkTarget(mockColumn("name")), null);
});

test("fkTarget refuses a partial target rather than building a half link", () => {
  assert.equal(fkTarget(fkCol("a", "auth", "users", null)), null);
  assert.equal(fkTarget(fkCol("b", "auth", null, "id")), null);
  assert.equal(fkTarget(fkCol("c", null, "users", "id")), null);
});

