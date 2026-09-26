import { policyBuckets } from "./storage-policies.ts";
import type { StorageBucket } from "./storage-api";

export type BucketRow = StorageBucket & { policies: number };

/**
 * What this app refuses to send as a bucket name.
 *
 * **Almost nothing**, and that is measured rather than assumed. An earlier version of this function
 * enforced `^[a-z0-9][a-z0-9.-]*$` and called it Supabase's rule; it is not. Measured 2026-09-25,
 * the API accepted `Catalog`, `with_underscore`, `with space`, `dot.name` and `a` — every one of
 * them a 200. Worse, the same check gated editing and deleting, so a bucket created elsewhere with
 * a capital letter would have been listed by this page and then refused when someone tried to
 * remove it.
 *
 * What is left is what a name cannot be regardless: empty, or long enough to suggest a mistake.
 */
export function bucketNameProblem(name: unknown): string | null {
  if (typeof name !== "string") return "A bucket needs a name.";
  if (name.trim().length === 0) return "A bucket needs a name.";
  if (name.length > 100) return "That name is too long.";
  return null;
}

/**
 * The file size limit as the original's table shows it.
 *
 * A bucket with no limit of its own falls back to the project's, and the dashboard says so rather
 * than leaving the cell empty — "Unset (50 MB)" means both "this bucket sets nothing" and "here is
 * what will actually apply".
 */
export function describeLimit(
  bucketLimit: number | null,
  projectLimit: number | undefined,
  format: (bytes: number) => string,
): string {
  if (bucketLimit) return format(bucketLimit);
  return projectLimit ? `Unset (${format(projectLimit)})` : "Unset";
}

export const describeMimeTypes = (types: string[] | null) =>
  types && types.length > 0 ? types.join(", ") : "Any";

/**
 * How many policies name this bucket.
 *
 * A policy belongs to a bucket because its expression quotes the bucket's name. That is a heuristic
 * over SQL text, not a relation the database models, so it can be wrong in both directions: a
 * policy saying `owner = \'avatars\'` counts for a bucket called `avatars`, and a policy that names
 * no bucket counts for none. Phase 4 shows unmatched policies in a group of their own rather than
 * hiding them, which is what keeps the second kind of error visible.
 *
 * Only policies on `storage.objects` are counted; `storage.buckets` has its own and they are not
 * about one bucket.
 */
export function countBucketPolicies(
  policies: { using_expr: string | null; check_expr: string | null }[],
  bucket: string,
): number {
  // Delegated rather than reimplemented. The first version built its needle as `'${bucket}'`, which
  // disagreed with the Policies tab for any bucket whose name contains an apostrophe: Postgres
  // renders `it's mine` as `'it''s mine'`, so the raw needle matched nothing and this column showed
  // 0 for a bucket the other tab filed three policies under.
  return policies.filter((p) => policyBuckets({ ...blank, ...p }, [bucket]).length > 0).length;
}

/** `policyBuckets` reads only the two expressions; the rest is here to satisfy the type. */
const blank = {
  name: "",
  command: "",
  roles: null,
  permissive: true,
  using_expr: null,
  check_expr: null,
};
