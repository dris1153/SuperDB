import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createEnumSql, dropEnumSql, readEnums, updateEnumSql } from "./enum-statements.ts";

test("a new type quotes its labels and carries its comment", () => {
  // The statement measured on ZKVault, 2026-09-26: the quote survived as `it's ok`.
  assert.equal(
    createEnumSql("public", "mood", "how it feels", ["happy", "it's ok"]),
    `create type "public"."mood" as enum ('happy', 'it''s ok');\ncomment on type "public"."mood" is 'how it feels';`,
  );
});

test("labels are checked before anything is sent", () => {
  assert.throws(() => createEnumSql("public", "mood", "", []), /at least one value/);
  assert.throws(() => createEnumSql("public", "mood", "", ["a", "a"]), /listed twice/);
  assert.throws(() => createEnumSql("public", "mood", "", ["a", ""]), /cannot be empty/);
  assert.throws(() => createEnumSql("public", "mood", "", ["é".repeat(32)]), /64 bytes; a value can be at most 63/);
});

test("an update appends, comments, and renames last", () => {
  const before = { name: "mood", comment: null, values: ["happy"] };
  assert.deepEqual(updateEnumSql("public", before, { name: "feeling", comment: "x", added: ["sad", "calm"] }).split("\n"), [
    `alter type "public"."mood" add value 'sad';`,
    `alter type "public"."mood" add value 'calm';`,
    `comment on type "public"."mood" is 'x';`,
    `alter type "public"."mood" rename to "feeling";`,
  ]);
});

test("an update cannot re-add a value the type already has, and says when nothing changed", () => {
  const before = { name: "mood", comment: "c", values: ["happy"] };
  assert.throws(() => updateEnumSql("public", before, { name: "mood", comment: "c", added: ["happy"] }), /listed twice/);
  assert.throws(() => updateEnumSql("public", before, { name: "mood", comment: "c", added: [] }), /Nothing has changed/);
});

test("drop names the type, and a malformed read is an empty list", () => {
  assert.equal(dropEnumSql("public", "mood"), `drop type "public"."mood";`);
  assert.deepEqual(readEnums([{ name: "a", values: ["x", 1] }, { values: [] }, null]), [{ name: "a", comment: null, values: ["x"] }]);
});
