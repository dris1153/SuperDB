import { strict as assert } from "node:assert";
import { test } from "node:test";
import { duplicateTable, editTable, readTableFacts } from "./ddl-table-statements.ts";
import { ENTITY_TYPES, filterEntities, noneFoundSentence, readEntities, readTableColumns } from "./table-entities.ts";

const state = { name: "events", comment: "", rls: true, realtime: false };

test("an edit sends only what changed", () => {
  assert.equal(editTable("public", state, { ...state, comment: "audit" }), `comment on table "public"."events" is 'audit';`);
  assert.equal(editTable("public", { ...state, comment: "x" }, { ...state, comment: "  " }), `comment on table "public"."events" is null;`);
  assert.throws(() => editTable("public", state, { ...state }), /Nothing has changed/);
});

test("a rename goes last, so everything before it names the table as it still is", () => {
  const sql = editTable("public", state, { name: "log", comment: "c", rls: false, realtime: true }).split("\n");
  assert.deepEqual(sql, [
    `comment on table "public"."events" is 'c';`,
    `alter table "public"."events" disable row level security;`,
    `alter publication supabase_realtime add table "public"."events";`,
    `alter table "public"."events" rename to "log";`,
  ]);
});

// The shape a live read answered with on ZKVault, 2026-09-26.
const facts = {
  foreignKeys: ["FOREIGN KEY (parent_id) REFERENCES public.parent(id) ON DELETE CASCADE"],
  insertColumns: ["id", "parent_id", "label"],
  identityColumns: ["id"],
  rls: true,
  comment: "it's a source",
};

test("a duplicate re-adds the foreign keys, the comment and RLS that `including all` leaves behind", () => {
  const sql = duplicateTable("public", "src", "copy", facts, false).split("\n");
  assert.deepEqual(sql, [
    `create table "public"."copy" (like "public"."src" including all);`,
    `alter table "public"."copy" add FOREIGN KEY (parent_id) REFERENCES public.parent(id) ON DELETE CASCADE;`,
    `comment on table "public"."copy" is 'it''s a source';`,
    `alter table "public"."copy" enable row level security;`,
  ]);
});

test("copying data names only insertable columns and moves each identity past the copied max", () => {
  const sql = duplicateTable("public", "src", "copy", facts, true);
  assert.match(sql, /insert into "public"\."copy" \("id", "parent_id", "label"\) overriding system value select "id", "parent_id", "label" from "public"\."src";/);
  assert.match(sql, /setval\(pg_catalog\.pg_get_serial_sequence\('"public"\."copy"', 'id'\), m\)/);
});

test("a duplicate refuses its own name and an empty one", () => {
  assert.throws(() => duplicateTable("public", "src", "src", facts, false), /different name/);
  assert.throws(() => duplicateTable("public", "src", " ", facts, false), /cannot be empty/);
});

test("facts and entities that arrive malformed are dropped, not trusted", () => {
  assert.equal(readTableFacts(null), null);
  assert.deepEqual(readTableFacts({ foreignKeys: [1, "FK"], rls: "yes" })?.foreignKeys, ["FK"]);
  assert.deepEqual(readEntities([{ name: "a", kind: "r", rows: 3 }, { name: "b", kind: "z" }, null]).map((e) => e.name), ["a"]);
  assert.deepEqual(readTableColumns({ found: true, columns: [{ name: "id" }, {}] }).columns.length, 1);
  assert.equal(readTableColumns(undefined).found, false);
});

test("search and the entity filter narrow together, and an empty filter says what was hidden", () => {
  const list = readEntities([
    { name: "users", kind: "r" },
    { name: "user_view", kind: "v" },
    { name: "orders", kind: "r" },
  ]);
  assert.deepEqual(filterEntities(list, "USER", ["r"]).map((e) => e.name), ["users"]);
  assert.deepEqual(filterEntities(list, "", ["v"]).map((e) => e.name), ["user_view"]);
  assert.equal(noneFoundSentence(["r", "v"], "public"), `No tables and views found in the schema "public"`);
  assert.equal(noneFoundSentence(ENTITY_TYPES.map((t) => t.kind).slice(0, 3), "x"), `No tables, views and materialized views found in the schema "x"`);
});
