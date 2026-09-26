import { strict as assert } from "node:assert";
import { test } from "node:test";
import { alterPolicySql, createPolicySql, dropPolicySql, takesCheck, takesUsing, type DbPolicy } from "./policy-statements.ts";
import { dataApiStatus, readPolicies, readPolicySpec, specFromPolicy, unwrap } from "./policy-model.ts";

const ROLES = ["anon", "authenticated", "service_role"];
const base = { schema: "public", table: "t", permissive: true, roles: [] as string[], using: "", check: "" };

test("each command offers only the clauses Postgres accepts for it", () => {
  assert.deepEqual(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"].map((c) => [takesUsing(c as never), takesCheck(c as never)]), [
    [true, false], [false, true], [true, true], [true, false], [true, true],
  ]);
});

test("create writes the frame the editor shows, public unquoted", () => {
  assert.equal(
    createPolicySql({ ...base, name: "read all", command: "SELECT", using: "true", check: "ignored" }, ROLES),
    `create policy "read all"\non "public"."t"\nas permissive\nfor select\nto public\nusing (true);`,
  );
  assert.match(createPolicySql({ ...base, name: "p", command: "UPDATE", permissive: false, roles: ["authenticated", "service_role"], using: "a", check: "b" }, ROLES),
    /as restrictive\nfor update\nto "authenticated", "service_role"\nusing \(a\)\nwith check \(b\);$/);
});

test("a policy without its required expression, or with a role that does not exist, is refused", () => {
  assert.throws(() => createPolicySql({ ...base, name: "p", command: "INSERT" }, ROLES), /WITH CHECK/);
  assert.throws(() => createPolicySql({ ...base, name: "p", command: "SELECT" }, ROLES), /USING/);
  assert.throws(() => createPolicySql({ ...base, name: "p", command: "SELECT", using: "true", roles: ["nobody"] }, ROLES), /no role nobody/);
});

const existing: DbPolicy = { name: "update own", command: "UPDATE", permissive: false, roles: ["authenticated"], using: "a", check: "a" };

test("an edit sends only what changed, and renames last", () => {
  const spec = specFromPolicy("public", "t", existing);
  assert.equal(alterPolicySql("public", "t", existing, { ...spec, using: "b" }, ROLES), `alter policy "update own"\non "public"."t"\nusing (b);`);
  const sql = alterPolicySql("public", "t", existing, { ...spec, roles: [], name: "renamed" }, ROLES).split("\n");
  assert.equal(sql[2], "to public;");
  assert.equal(sql.at(-1), `alter policy "update own" on "public"."t" rename to "renamed";`);
  assert.throws(() => alterPolicySql("public", "t", existing, spec, ROLES), /Nothing has changed/);
});

test("drop names the policy on its table", () => {
  assert.equal(dropPolicySql("public", "t", `it's "x"`), `drop policy "it's ""x""" on "public"."t";`);
});

test("only a bracket pair around the whole expression is unwrapped", () => {
  assert.equal(unwrap("(( SELECT auth.uid() AS uid) = user_id)"), "( SELECT auth.uid() AS uid) = user_id");
  assert.equal(unwrap("(a) or (b)"), "(a) or (b)");
  assert.equal(unwrap("true"), "true");
});

// SuperDB's connection_events, read 2026-09-26: anon holds nothing, the other two everything.
const read = readPolicies({
  tables: [{ name: "connection_events", rls: true, policies: [{ name: "own", command: "SELECT", roles: ["authenticated"], using: "(x)" }],
    grants: { anon: [], authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"], service_role: ["SELECT", "INSERT", "UPDATE", "DELETE"] } }],
  roles: ROLES,
});

test("the Data API status follows the original's rules", () => {
  const t = read.tables[0];
  assert.equal(dataApiStatus(t, true), "custom-grants");
  const full = { ...t, grants: Object.fromEntries(ROLES.map((r) => [r, ["SELECT", "INSERT", "UPDATE", "DELETE"]])) };
  assert.equal(dataApiStatus(full, true), "secured");
  assert.equal(dataApiStatus({ ...full, policies: [] }, true), "locked-by-rls");
  assert.equal(dataApiStatus({ ...full, rls: false }, true), "publicly-readable");
  assert.equal(dataApiStatus({ ...t, grants: { anon: [], authenticated: [], service_role: [] } }, true), "no-grants");
  assert.equal(dataApiStatus(full, false), "unknown");
});

test("what the browser posts is checked field by field", () => {
  assert.ok(readPolicySpec({ ...base, name: "p", command: "ALL" }));
  assert.equal(readPolicySpec({ ...base, name: "p", command: "TRUNCATE" }), null);
  assert.equal(readPolicySpec({ ...base, name: "p", command: "ALL", roles: [1] }), null);
});
