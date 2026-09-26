import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readSchemaGraph, schemaMarkdown, tableMarkdown, tableNodeId, toGraph } from "./schema-graph.ts";
import { autoLayout, place, readPositions } from "./schema-layout.ts";

const col = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  format: "uuid",
  nullable: false,
  identity: false,
  primary: false,
  unique: false,
  ...extra,
});

// The shape the catalog read answered with on SuperDB's public schema, 2026-09-26, trimmed.
const RAW = {
  tables: [
    { name: "connections", comment: null, columns: [col("id", { primary: true }), col("user_id")] },
    { name: "vault", comment: null, columns: [col("user_id", { primary: true })] },
    { name: "events", comment: "audit", columns: [col("id"), col("connection_id", { nullable: true }), col("user_id")] },
    { name: "pair", comment: null, columns: [col("a"), col("b")] },
    { name: "pair_ref", comment: null, columns: [col("a"), col("b")] },
  ],
  relationships: [
    { id: "1:1", source_table: "connections", source_column: "user_id", target_schema: "auth", target_table: "users", target_column: "id" },
    { id: "2:1", source_table: "vault", source_column: "user_id", target_schema: "auth", target_table: "users", target_column: "id" },
    { id: "3:1", source_table: "events", source_column: "connection_id", target_schema: "public", target_table: "connections", target_column: "id" },
    { id: "4:1", source_table: "pair_ref", source_column: "a", target_schema: "public", target_table: "pair", target_column: "a" },
    { id: "4:2", source_table: "pair_ref", source_column: "b", target_schema: "public", target_table: "pair", target_column: "b" },
  ],
};

test("a key into another schema points at one label node, however many share it", () => {
  const { nodes, edges } = toGraph("public", readSchemaGraph(RAW));
  const labels = nodes.filter((n) => n.data.foreign);
  assert.deepEqual(labels.map((n) => n.data.name), ["auth.users.id"]);
  assert.equal(edges.filter((e) => e.target === labels[0].id).length, 2);
});

test("a key within the schema joins column to column", () => {
  const { edges } = toGraph("public", readSchemaGraph(RAW));
  assert.deepEqual(
    edges.find((e) => e.id === "3:1"),
    { id: "3:1", source: tableNodeId("events"), sourceHandle: "connection_id", target: tableNodeId("connections"), targetHandle: "id" },
  );
});

test("a two-column key is two edges", () => {
  const { edges } = toGraph("public", readSchemaGraph(RAW));
  assert.deepEqual(edges.filter((e) => e.source === tableNodeId("pair_ref")).map((e) => e.targetHandle), ["a", "b"]);
});

test("a key naming a column that is not there draws nothing rather than a dangling edge", () => {
  const raw = { ...RAW, relationships: [{ ...RAW.relationships[2], target_column: "gone" }] };
  assert.equal(toGraph("public", readSchemaGraph(raw)).edges.length, 0);
});

test("a malformed answer is an empty graph, not a throw", () => {
  for (const raw of [null, "x", 1, { tables: "no" }, { tables: [null, {}], relationships: [{}] }]) {
    const graph = readSchemaGraph(raw);
    assert.deepEqual(graph, { tables: [], relationships: [] }, JSON.stringify(raw));
  }
});

test("markdown keeps its table when a name carries a pipe or a backtick", () => {
  const md = tableMarkdown({ name: "a|b", comment: null, columns: [col("x`y", { primary: true, nullable: true })] });
  assert.match(md, /^## Table `a\\\|b`/);
  assert.match(md, /\| `x\\`y` \| `uuid` \| Primary Nullable \|/);
  assert.equal(schemaMarkdown(readSchemaGraph(RAW)).match(/^## Table/gm)?.length, 5);
});

test("the layout runs left to right: a table sits left of what it references", () => {
  const { nodes, edges } = toGraph("public", readSchemaGraph(RAW));
  const placed = new Map(autoLayout(nodes, edges).map((n) => [n.id, n.position]));
  assert.ok(placed.get(tableNodeId("events"))!.x < placed.get(tableNodeId("connections"))!.x);
});

test("saved places are kept and a new table does not disturb them", () => {
  const { nodes, edges } = toGraph("public", readSchemaGraph(RAW));
  const saved = { [tableNodeId("vault")]: { x: 500, y: 700 } };
  const placed = new Map(place(nodes, edges, saved).map((n) => [n.id, n.position]));
  assert.deepEqual(placed.get(tableNodeId("vault")), { x: 500, y: 700 });
  assert.ok(placed.get(tableNodeId("events"))!.y < 0, "an unsaved table goes in the cascade above");
});

test("stored positions are checked before use", () => {
  assert.equal(readPositions(null), null);
  assert.equal(readPositions("{not json"), null);
  assert.deepEqual(readPositions(JSON.stringify({ a: { x: 1, y: 2 }, b: { x: "1", y: 2 }, c: null })), { a: { x: 1, y: 2 } });
});
