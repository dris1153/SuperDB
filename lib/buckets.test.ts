import assert from "node:assert/strict";
import test from "node:test";
import { bucketNameProblem, countBucketPolicies, describeLimit, describeMimeTypes } from "./buckets.ts";

const mb = (bytes: number) => `${bytes / 1024 / 1024} MB`;

test("a name is refused only when it cannot be one", () => {
  assert.equal(bucketNameProblem("catalog"), null);
  assert.equal(bucketNameProblem("my.bucket-2"), null);
  // All measured 2026-09-25 as accepted by the API. An earlier rule here rejected each of them,
  // which also meant refusing to delete a bucket that already existed with such a name.
  assert.equal(bucketNameProblem("Catalog"), null);
  assert.equal(bucketNameProblem("with_underscore"), null);
  assert.equal(bucketNameProblem("with space"), null);

  assert.match(bucketNameProblem("") ?? "", /needs a name/);
  assert.match(bucketNameProblem("   ") ?? "", /needs a name/);
  assert.match(bucketNameProblem("x".repeat(101)) ?? "", /too long/);
  // A server action's argument is whatever the caller sent.
  assert.match(bucketNameProblem(undefined) ?? "", /needs a name/);
  assert.match(bucketNameProblem(5) ?? "", /needs a name/);
});

test("a bucket with no limit shows the project's, and says it is not its own", () => {
  assert.equal(describeLimit(null, 52428800, mb), "Unset (50 MB)");
  assert.equal(describeLimit(1048576, 52428800, mb), "1 MB");
  // The project limit can be missing too — then there is nothing honest to put in the brackets.
  assert.equal(describeLimit(null, undefined, mb), "Unset");
});

test("no mime restriction reads as Any", () => {
  assert.equal(describeMimeTypes(null), "Any");
  assert.equal(describeMimeTypes([]), "Any");
  assert.equal(describeMimeTypes(["image/png", "text/plain"]), "image/png, text/plain");
});

test("a policy counts for the bucket its expression names", () => {
  const policies = [
    { using_expr: "(bucket_id = 'catalog')", check_expr: null },
    { using_expr: null, check_expr: "(bucket_id = 'uploads')" },
    { using_expr: "(auth.role() = 'authenticated')", check_expr: null },
  ];
  assert.equal(countBucketPolicies(policies, "catalog"), 1);
  assert.equal(countBucketPolicies(policies, "uploads"), 1);
  // Names no bucket, so it counts for none — and phase 4 still has to show it somewhere.
  assert.equal(countBucketPolicies(policies, "other"), 0);
});

test("a bucket name with an apostrophe is counted the way Postgres renders it", () => {
  // The two halves of this heuristic used to disagree here: Postgres writes `it's mine` as
  // `'it''s mine'`, and a needle built without that doubling matched nothing.
  const policies = [{ using_expr: "(bucket_id = 'it''s mine'::text)", check_expr: null }];
  assert.equal(countBucketPolicies(policies, "it's mine"), 1);
  assert.equal(countBucketPolicies(policies, "mine"), 0);
});

test("a bucket whose name is a substring of another does not steal its policies", () => {
  const policies = [{ using_expr: "(bucket_id = 'catalogue')", check_expr: null }];
  assert.equal(countBucketPolicies(policies, "catalog"), 0);
});

test("the count is a heuristic and can be generous", () => {
  // Quoting the name anywhere counts, so this is not a claim about `bucket_id`. Worth pinning so
  // the number is understood as an indication rather than a fact.
  const policies = [{ using_expr: "(owner = 'avatars')", check_expr: null }];
  assert.equal(countBucketPolicies(policies, "avatars"), 1);
});
