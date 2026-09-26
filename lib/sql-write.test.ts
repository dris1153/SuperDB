import assert from "node:assert/strict";
import test from "node:test";
import { buildCount, buildDelete, buildInsert, buildUpdate } from "./sql-statements.ts";
import { jsonLiteral } from "./sql-write.ts";
import { MAX_CELL_CHARS, type ColumnInfo } from "./table-view.ts";

const col = (name: string, data_type = "text", pk_pos: number | null = null): ColumnInfo => ({
  ordinal: 0,
  name,
  short_type: data_type,
  data_type,
  nullable: true,
  default_expr: null,
  is_pk: pk_pos != null,
  generated: false,
  pk_pos,
  fk_schema: null,
  fk_table: null,
  fk_column: null,
  fk_pairs: null,
});

const cols = [col("id", "integer", 1), col("name", "text"), col("meta", "jsonb")];

// --- the literal ---

test("wraps the JSON in a dollar-quoted literal with its tag", () => {
  const { sql, tag } = jsonLiteral({ a: 1 });
  assert.equal(sql, `$${tag}$${JSON.stringify({ a: 1 })}$${tag}$`);
});

test("the emitted tag never appears inside the encoded JSON", () => {
  // The whole safety of the construction is this one property.
  for (let i = 0; i < 200; i++) {
    const { sql, tag } = jsonLiteral({ v: `noise ${Math.random()}` });
    assert.equal(sql.indexOf(`$${tag}$`), 0, "tag must open the literal");
    assert.equal(sql.lastIndexOf(`$${tag}$`), sql.length - tag.length - 2);
  }
});

test("a value containing what would have been the tag forces a different one", () => {
  const first = jsonLiteral({ v: "x" }).tag;
  const { sql, tag } = jsonLiteral({ v: `$${first}$` });
  assert.notEqual(tag, first);
  assert.ok(sql.includes(`$${first}$`), "the payload keeps its text");
  assert.equal(sql.split(`$${tag}$`).length, 3, "exactly one opening and one closing tag");
});

test("a hostile payload stays inside the literal", () => {
  const hostile = `x'; drop table bookmarks; --  $$ "q" \\ ümlaut 🙂\n`;
  const { sql, tag } = jsonLiteral({ v: hostile });
  const open = `$${tag}$`;

  // A single quote is harmless here and is *not* escaped by JSON — that is the point of dollar
  // quoting. What matters is that the payload cannot reach the end of the literal, so the tag must
  // appear exactly twice and the text must sit strictly between the two.
  assert.equal(sql.split(open).length - 1, 2, "exactly one opening and one closing tag");
  assert.equal(sql.slice(open.length, -open.length), JSON.stringify({ v: hostile }));
});

// --- insert ---

test("insert names only the columns the rows supply", () => {
  const { sql } = buildInsert("public", "t", cols, [{ name: "bob" }]);
  assert.ok(sql.startsWith(`insert into "public"."t" ("name")`));
  assert.ok(sql.includes(`as x("name" text)`));
});

test("insert declares each column with its real catalog type, not text", () => {
  const { sql } = buildInsert("public", "t", cols, [{ id: 1, meta: { a: 1 } }]);
  assert.ok(sql.includes(`"id" integer`));
  assert.ok(sql.includes(`"meta" jsonb`));
});

test("insert returns the primary key, and says so", () => {
  const st = buildInsert("public", "t", cols, [{ name: "b" }]);
  assert.ok(st.sql.includes(`returning "id"`));
  assert.deepEqual(st.returning, ["id"]);
});

test("insert refuses rows that supply different columns", () => {
  // Measured against a live database: a column reaches its DEFAULT only by being absent from the
  // INSERT column list. Taking the union puts it in the list for every row, and the rows that
  // omitted it get an explicit NULL instead — silent data loss.
  assert.throws(
    () => buildInsert("public", "t", cols, [{ name: "a" }, { meta: {} }]),
    /same columns/i,
  );
  assert.throws(
    () => buildInsert("public", "t", cols, [{ name: "a", meta: {} }, { name: "b" }]),
    /same columns/i,
  );
});

test("insert accepts rows that all supply the same columns", () => {
  const { sql } = buildInsert("public", "t", cols, [
    { name: "a", meta: {} },
    { name: "b", meta: { x: 1 } },
  ]);
  assert.ok(sql.includes(`("name", "meta")`));
});

test("insert refuses a column that is not in the catalog", () => {
  assert.throws(() => buildInsert("public", "t", cols, [{ ghost: 1 }]), /ghost/);
});

test("insert refuses an empty row list", () => {
  assert.throws(() => buildInsert("public", "t", cols, []), /no rows/i);
});

test("insert refuses rows with no usable column", () => {
  assert.throws(() => buildInsert("public", "t", cols, [{}]), /no columns/i);
});

// --- generated columns ---

const generated: ColumnInfo = { ...col("shout", "text"), generated: true };
const withGenerated = [...cols, generated];

test("insert refuses a generated column", () => {
  assert.throws(() => buildInsert("public", "t", withGenerated, [{ shout: "x" }]), /generated/i);
});

test("update refuses to set a generated column", () => {
  assert.throws(
    () => buildUpdate("public", "t", withGenerated, { id: 1 }, { shout: "x" }),
    /generated/i,
  );
});

test("an identity primary key can still address a row", () => {
  // The guard covers written columns only. `generated always as identity` on the key is the ordinary
  // Supabase shape, and rejecting it there would make such a table uneditable.
  const identity = [{ ...col("id", "integer", 1), generated: true }, col("name", "text")];
  const { sql } = buildUpdate("public", "t", identity, { id: 1 }, { name: "bob" });
  assert.ok(sql.includes(`where t."id" = x."id"`));
});

// --- values the grid shortened ---

const truncated = "a".repeat(MAX_CELL_CHARS) + "…";

test("insert refuses a value the grid truncated for display", () => {
  // Writing it back would replace the real value with a shortened one, silently and with no undo.
  assert.throws(() => buildInsert("public", "t", cols, [{ name: truncated }]), /shortened/i);
});

test("update refuses a truncated value in the patch or the key", () => {
  assert.throws(() => buildUpdate("public", "t", cols, { id: 1 }, { name: truncated }), /shortened/i);
});

test("a value that merely ends in an ellipsis is not mistaken for a truncated one", () => {
  const { sql } = buildInsert("public", "t", cols, [{ name: "short…" }]);
  assert.ok(sql.includes("short"));
});

test("a truncated column that is not part of the key does not block a delete", () => {
  // The guard judges what the statement matches on, not whatever the caller handed over. A row with
  // a shortened `name` is still perfectly deletable by its id, and refusing it would name a column
  // the DELETE never mentions.
  const { sql } = buildDelete("public", "t", cols, [{ id: 1, name: truncated }]);
  assert.ok(sql.includes(`t."id" = x."id"`));
  assert.ok(!sql.includes("aaaa"));
});

test("count and delete refuse a truncated key", () => {
  // A shortened key matches nothing: the count reads 0 and the delete removes nothing, both
  // reporting success. Every builder has to reject the same values, not only the two that write.
  const textKey = [col("slug", "text", 1)];
  assert.throws(() => buildCount("public", "t", textKey, [{ slug: truncated }]), /shortened/i);
  assert.throws(() => buildDelete("public", "t", textKey, [{ slug: truncated }]), /shortened/i);
});

// --- update ---

test("update sets only the patched columns and matches on the key", () => {
  const { sql, returning } = buildUpdate("public", "t", cols, { id: 1 }, { name: "bob" });
  assert.ok(sql.includes(`set "name" = x."name"`));
  assert.ok(sql.includes(`where t."id" = x."id"`));
  assert.ok(sql.includes(`returning t."id"`));
  assert.deepEqual(returning, ["id"]);
});

test("update declares both patch and key columns in the record list", () => {
  const { sql } = buildUpdate("public", "t", cols, { id: 1 }, { name: "bob" });
  assert.ok(sql.includes(`"name" text`));
  assert.ok(sql.includes(`"id" integer`));
});

test("update throws on an empty key rather than emitting an unpredicated UPDATE", () => {
  // An UPDATE whose WHERE quietly disappears is how a table gets wiped.
  assert.throws(() => buildUpdate("public", "t", cols, {}, { name: "b" }), /key/i);
});

test("update throws on an empty patch", () => {
  assert.throws(() => buildUpdate("public", "t", cols, { id: 1 }, {}), /nothing to set/i);
});

test("update refuses a key column that is not a primary key", () => {
  assert.throws(() => buildUpdate("public", "t", cols, { name: "b" }, { meta: {} }), /primary key/i);
});

test("update refuses to change the primary key", () => {
  // Key and patch share one JSON object, so the key wins and the edit would be silently discarded
  // while still reporting one row updated.
  assert.throws(
    () => buildUpdate("public", "t", cols, { id: 1 }, { id: 2, name: "x" }),
    /cannot change the primary key/i,
  );
});

// --- delete ---

test("delete matches on the key and returns it", () => {
  const { sql, returning } = buildDelete("public", "t", cols, [{ id: 1 }, { id: 2 }]);
  assert.ok(sql.startsWith(`delete from "public"."t" as t`));
  assert.ok(sql.includes(`where t."id" = x."id"`));
  assert.ok(sql.includes(`returning t."id"`));
  assert.deepEqual(returning, ["id"]);
});

test("delete throws on an empty key list", () => {
  assert.throws(() => buildDelete("public", "t", cols, []), /no rows/i);
});

test("delete throws when a row is missing part of the key", () => {
  const composite = [col("a", "integer", 1), col("b", "integer", 2), col("c", "text")];
  assert.throws(() => buildDelete("public", "t", composite, [{ a: 1 }]), /key/i);
});

test("delete throws when part of the key is undefined", () => {
  // `n in k` is true for an explicitly undefined key; JSON.stringify drops it, so the predicate
  // would compare against NULL and match nothing.
  assert.throws(() => buildDelete("public", "t", cols, [{ id: undefined }]), /key/i);
});

test("delete matches every column of a composite key", () => {
  const composite = [col("a", "integer", 1), col("b", "integer", 2)];
  const { sql } = buildDelete("public", "t", composite, [{ a: 1, b: 2 }]);
  assert.ok(sql.includes(`t."a" = x."a"`));
  assert.ok(sql.includes(`t."b" = x."b"`));
});

test("delete keeps only the key columns from whatever row objects it is handed", () => {
  const { sql } = buildDelete("public", "t", cols, [{ id: 1, name: "ignored", meta: {} }]);
  assert.ok(!sql.includes("ignored"));
});

// --- identifiers ---

test("quotes identifiers so a reserved word or mixed case survives", () => {
  const odd = [col("Order", "text", 1), col("select", "text")];
  const { sql } = buildInsert("Public", "MyTable", odd, [{ select: "x" }]);
  assert.ok(sql.includes(`"Public"."MyTable"`));
  assert.ok(sql.includes(`"select" text`));
  assert.ok(sql.includes(`returning "Order"`));
});

test("a hostile column name stays inside one quoted identifier", () => {
  const evil = [col("id", "integer", 1), col(`x"; drop table y; --`, "text")];
  const { sql } = buildInsert("public", "t", evil, [{ [`x"; drop table y; --`]: "v" }]);
  assert.ok(sql.includes(`"x""; drop table y; --"`));
});

// --- preview count ---

test("count joins on the same key the write will use", () => {
  const sql = buildCount("public", "t", cols, [{ id: 1 }, { id: 2 }]);
  assert.ok(sql.startsWith("select count(*)::int as n"));
  assert.ok(sql.includes(`from "public"."t" as t`));
  assert.ok(sql.includes(`on t."id" = x."id"`));
});

test("count deduplicates keys so it cannot report more rows than exist", () => {
  const sql = buildCount("public", "t", cols, [{ id: 1 }, { id: 1 }]);
  assert.equal(sql.match(/"id":1/g)?.length, 1);
});

test("count refuses an empty key list", () => {
  assert.throws(() => buildCount("public", "t", cols, []), /no rows/i);
});

test("count refuses a partial composite key", () => {
  const composite = [col("a", "integer", 1), col("b", "integer", 2)];
  assert.throws(() => buildCount("public", "t", composite, [{ a: 1 }]), /key/i);
});
