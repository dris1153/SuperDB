import assert from "node:assert/strict";
import test from "node:test";
import {
  orderClause,
  parseFilters,
  parseSort,
  serialiseFilter,
  serialiseSort,
  whereClause,
} from "./table-view.ts";
import type { ColumnInfo } from "./table-view.ts";

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
  pk_pos: pkPos,
  fk_target: null,
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

// --- filters ---
const cols3 = [mockColumn("id", 1), mockColumn("name", null, "text"), mockColumn("age")];

test("parseFilters reads column, operator and value", () => {
  assert.deepEqual(parseFilters(["name.eq.bob"]), [{ column: "name", op: "eq", value: "bob" }]);
});

test("parseFilters keeps dots inside the value", () => {
  assert.deepEqual(parseFilters(["name.eq.a.b.c"]), [{ column: "name", op: "eq", value: "a.b.c" }]);
});

test("parseFilters handles the valueless operators", () => {
  assert.deepEqual(parseFilters(["name.isnull."]), [{ column: "name", op: "isnull", value: "" }]);
});

test("parseFilters drops entries with no recognisable operator", () => {
  assert.deepEqual(parseFilters(["name.wat.x", "", "nonsense"]), []);
});

test("whereClause leaves the literal untyped so Postgres casts to the column type", () => {
  // Casting the column to text instead would make '9' > '10' true.
  assert.equal(whereClause(cols3, [{ column: "age", op: "gt", value: "9" }]), ` where "age" > '9'`);
});

test("whereClause casts to text only for pattern matching", () => {
  assert.equal(
    whereClause(cols3, [{ column: "name", op: "ilike", value: "%bo%" }]),
    ` where "name"::text ilike '%bo%'`,
  );
});

test("whereClause emits no literal for the valueless operators", () => {
  assert.equal(whereClause(cols3, [{ column: "name", op: "isnull", value: "" }]), ` where "name" is null`);
  assert.equal(
    whereClause(cols3, [{ column: "name", op: "notnull", value: "" }]),
    ` where "name" is not null`,
  );
});

test("whereClause quotes every item of an IN list", () => {
  assert.equal(
    whereClause(cols3, [{ column: "name", op: "in", value: "a, b ,c" }]),
    ` where "name" in ('a', 'b', 'c')`,
  );
});

test("whereClause drops an IN with nothing in it rather than emitting in ()", () => {
  assert.equal(whereClause(cols3, [{ column: "name", op: "in", value: " , " }]), "");
});

test("whereClause ignores a column that is not in the table", () => {
  assert.equal(whereClause(cols3, [{ column: "ghost", op: "eq", value: "x" }]), "");
});

test("whereClause keeps an injection attempt inside one literal", () => {
  assert.equal(
    whereClause(cols3, [{ column: "name", op: "eq", value: "x' or '1'='1" }]),
    ` where "name" = 'x'' or ''1''=''1'`,
  );
});

test("whereClause joins several filters with and", () => {
  assert.equal(
    whereClause(cols3, [
      { column: "age", op: "gte", value: "18" },
      { column: "name", op: "neq", value: "bob" },
    ]),
    ` where "age" >= '18' and "name" <> 'bob'`,
  );
});

test("filters round-trip through serialise and parse", () => {
  const f = { column: "name", op: "like" as const, value: "a.b%" };
  assert.deepEqual(parseFilters([serialiseFilter(f)]), [f]);
});
