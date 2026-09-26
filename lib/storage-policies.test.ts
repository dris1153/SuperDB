import assert from "node:assert/strict";
import test from "node:test";
import {
  createPolicyStatement,
  dropPolicyStatement,
  groupPolicies,
  policyBuckets,
  policyNameProblem,
  templateById,
} from "./storage-policies.ts";
import type { Policy } from "./table-editor.ts";

const policy = (over: Partial<Policy> = {}): Policy => ({
  name: "p",
  command: "SELECT",
  roles: "public",
  permissive: true,
  using_expr: null,
  check_expr: null,
  ...over,
});

test("a bucket name with a quote in it cannot break out of the literal", () => {
  // Measured 2026-09-25: the API accepts nearly any bucket name, so this is reachable.
  const template = templateById("public-read")!;
  const sql = createPolicyStatement(template, "it's mine", "read");
  assert.match(sql, /bucket_id = 'it''s mine'/);
  assert.equal(sql.includes("'it's mine'"), false);
});

test("a policy name with a quote in it cannot break out of the identifier", () => {
  const template = templateById("public-read")!;
  const sql = createPolicyStatement(template, "catalog", 'say "hi"');
  assert.match(sql, /create policy "say ""hi"""/);
});

test("each template produces the clauses its command needs", () => {
  const read = createPolicyStatement(templateById("public-read")!, "catalog", "r");
  assert.match(read, /for SELECT/);
  assert.match(read, /using \(/);
  assert.equal(read.includes("with check"), false);

  // INSERT has no USING clause at all; emitting one is a syntax error.
  const insert = createPolicyStatement(templateById("auth-upload")!, "catalog", "w");
  assert.match(insert, /for INSERT/);
  assert.match(insert, /with check \(/);
  assert.equal(insert.includes("using ("), false);

  const own = createPolicyStatement(templateById("own-folder")!, "catalog", "o");
  assert.match(own, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(own, /using \(/);
  assert.match(own, /with check \(/);
});

test("dropping names the table the policy is on", () => {
  assert.equal(dropPolicyStatement("objects", "read"), 'drop policy "read" on storage.objects;');
  assert.equal(dropPolicyStatement("buckets", "list"), 'drop policy "list" on storage.buckets;');
});

test("a policy is matched to the bucket its expression quotes", () => {
  const p = policy({ using_expr: "(bucket_id = 'catalog')" });
  assert.deepEqual(policyBuckets(p, ["catalog", "uploads"]), ["catalog"]);
  // A substring is not a match: the quotes make 'catalog' absent from 'catalogue'.
  assert.deepEqual(policyBuckets(p, ["catalogue"]), []);
});

test("a policy naming two buckets belongs to both", () => {
  const p = policy({ using_expr: "(bucket_id in ('a','b'))" });
  assert.deepEqual(policyBuckets(p, ["a", "b", "c"]), ["a", "b"]);
});

test("a policy that names no bucket is shown, not hidden", () => {
  const named = policy({ name: "in-bucket", using_expr: "(bucket_id = 'catalog')" });
  const general = policy({ name: "any-signed-in", using_expr: "(auth.role() = 'authenticated')" });

  const groups = groupPolicies([named, general], [], ["catalog"]);
  assert.deepEqual(groups.byBucket.map((g) => g.bucket), ["catalog"]);
  assert.deepEqual(groups.byBucket[0].policies.map((p) => p.name), ["in-bucket"]);
  // The whole point: a heuristic that misses must leave the policy somewhere visible.
  assert.deepEqual(groups.otherObjects.map((p) => p.name), ["any-signed-in"]);
});

test("policies on storage.buckets are never about one bucket", () => {
  const onBuckets = policy({ name: "list-buckets" });
  const groups = groupPolicies([], [onBuckets], ["catalog"]);
  assert.deepEqual(groups.onBuckets.map((p) => p.name), ["list-buckets"]);
  assert.deepEqual(groups.byBucket[0].policies, []);
});

test("a policy needs a name", () => {
  assert.equal(policyNameProblem("read files"), null);
  assert.match(policyNameProblem("") ?? "", /needs a name/);
  assert.match(policyNameProblem("  ") ?? "", /needs a name/);
  assert.match(policyNameProblem(undefined) ?? "", /needs a name/);
  assert.match(policyNameProblem("x".repeat(64)) ?? "", /too long/);
  assert.equal(policyNameProblem("x".repeat(63)), null);
  // Postgres counts bytes, so a name well under 63 characters can still be over the limit.
  assert.match(policyNameProblem("\u00e9".repeat(32)) ?? "", /too long/);
});
