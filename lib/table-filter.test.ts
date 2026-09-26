import assert from "node:assert/strict";
import test from "node:test";
import { parseFilters, serialiseFilter, whereClause } from "./table-filter.ts";
import type { ColumnInfo } from "./table-view.ts";

/** Only the fields `whereClause` reads; the rest of ColumnInfo is irrelevant here. */
const mockColumn = (name: string, short_type = "int"): ColumnInfo => ({
  ordinal: 0,
  name,
  short_type,
  data_type: short_type,
  nullable: false,
  default_expr: null,
  is_pk: false,
  generated: false,
  pk_pos: null,
  fk_schema: null,
  fk_table: null,
  fk_column: null,
  fk_pairs: null,
});

// --- filters ---
const cols3 = [mockColumn("id"), mockColumn("name", "text"), mockColumn("age")];

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


// --- free-text search ---
test("search matches any column as a substring", () => {
  assert.equal(
    whereClause(cols3, [], "bob"),
    ` where (pg_catalog.strpos(pg_catalog.lower("id"::text), 'bob') > 0` +
      ` or pg_catalog.strpos(pg_catalog.lower("name"::text), 'bob') > 0` +
      ` or pg_catalog.strpos(pg_catalog.lower("age"::text), 'bob') > 0)`,
  );
});

test("search treats % and _ as literal text, not wildcards", () => {
  // This is why it is strpos and not ilike: a user searching for "50%" means the characters.
  const sql = whereClause([mockColumn("a")], [], "50%");
  assert.ok(sql.includes("'50%'"));
  assert.ok(!sql.includes("ilike"));
});

test("search is lowercased on both sides", () => {
  const sql = whereClause([mockColumn("a")], [], "BoB");
  assert.ok(sql.includes("'bob'"));
  assert.ok(sql.includes("pg_catalog.lower"));
});

test("search combines with filters using and", () => {
  const sql = whereClause(cols3, [{ column: "age", op: "gt", value: "18" }], "bob");
  assert.ok(sql.startsWith(" where ("));
  assert.ok(sql.includes(`) and "age" > '18'`));
});

test("an empty or whitespace-only search adds nothing", () => {
  assert.equal(whereClause(cols3, [], ""), "");
  assert.equal(whereClause(cols3, [], "   "), "");
});

test("search keeps an injection attempt inside one literal", () => {
  assert.ok(whereClause([mockColumn("a")], [], "x' or '1'='1").includes("'x'' or ''1''=''1'"));
});

test("search on a table with no columns adds nothing", () => {
  assert.equal(whereClause([], [], "bob"), "");
});
