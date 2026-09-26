// Explicit .ts extensions, like lib/sql-write.ts: this module is imported directly by a node:test
// file, and Node has no bundler to fall back on. Do not tidy them away.
import { quoteIdent, quoteLiteral } from "./sql-ident.ts";
import type { Policy } from "./table-editor.ts";

/** The two tables storage policies live on. Nothing else in the `storage` schema takes one. */
export const STORAGE_TABLES = ["objects", "buckets"] as const;
export type StorageTable = (typeof STORAGE_TABLES)[number];

/**
 * The canned policies the Supabase dashboard offers, as this app builds them.
 *
 * Deliberately few. A policy is arbitrary SQL, and a builder that tried to cover that would be a
 * worse SQL editor than the one this app already has — these are the four shapes that answer "who
 * can touch this bucket", and anything else belongs in the editor.
 */
export type PolicyTemplate = {
  id: string;
  label: string;
  hint: string;
  command: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";
  roles: string;
  /** Built against the bucket, already quoted. `null` when the command takes no USING clause. */
  using: ((bucket: string) => string) | null;
  check: ((bucket: string) => string) | null;
};

const inBucket = (bucket: string) => `bucket_id = ${quoteLiteral(bucket)}`;

/** `storage.foldername(name)` splits an object's path; the first element is its top folder. */
const ownFolder = (bucket: string) =>
  `${inBucket(bucket)} and (storage.foldername(name))[1] = auth.uid()::text`;

export const POLICY_TEMPLATES = [
  {
    id: "public-read",
    label: "Anyone can read",
    hint: "Every visitor may download from this bucket, signed in or not.",
    command: "SELECT",
    roles: "public",
    using: inBucket,
    check: null,
  },
  {
    id: "auth-read",
    label: "Signed-in users can read",
    hint: "Reading requires a session; nothing is public.",
    command: "SELECT",
    roles: "authenticated",
    using: inBucket,
    check: null,
  },
  {
    id: "auth-upload",
    label: "Signed-in users can upload",
    hint: "Adding files requires a session. Does not allow replacing or deleting.",
    command: "INSERT",
    roles: "authenticated",
    using: null,
    check: inBucket,
  },
  {
    id: "own-folder",
    label: "Users manage their own folder",
    hint: "Each user may do anything inside a folder named after their user id, and nothing outside it.",
    command: "ALL",
    roles: "authenticated",
    using: ownFolder,
    check: ownFolder,
  },
] as const satisfies readonly PolicyTemplate[];

export const templateById = (id: string) => POLICY_TEMPLATES.find((t) => t.id === id) ?? null;

/**
 * A policy name is arbitrary text; these are the two things it cannot be.
 *
 * Sixty-three **bytes**, not characters: that is Postgres's identifier limit, and a longer name is
 * silently truncated to it. Two names sharing their first 63 bytes would then collide with an
 * "already exists" nobody could explain from what is on screen.
 */
export function policyNameProblem(name: unknown): string | null {
  if (typeof name !== "string" || name.trim() === "") return "A policy needs a name.";
  if (new TextEncoder().encode(name.trim()).length > 63) return "That name is too long.";
  return null;
}

/**
 * The statement that creates one.
 *
 * Pure, so the preview the user approves is built by the same code the server runs — and tested,
 * because a bucket name can contain a quote and this interpolates one into SQL. The app's rule is
 * that nothing the browser composes is executed: the server rebuilds this from the template id and
 * the bucket name, and the two agreeing is what makes the preview honest.
 */
export function createPolicyStatement(
  template: PolicyTemplate,
  bucket: string,
  name: string,
): string {
  const clauses = [
    `create policy ${quoteIdent(name)}`,
    `  on storage.objects`,
    `  for ${template.command}`,
    `  to ${template.roles}`,
  ];

  if (template.using) clauses.push(`  using (${template.using(bucket)})`);
  if (template.check) clauses.push(`  with check (${template.check(bucket)})`);

  return `${clauses.join("\n")};`;
}

export const dropPolicyStatement = (table: StorageTable, name: string) =>
  `drop policy ${quoteIdent(name)} on storage.${table};`;

/**
 * Which bucket a policy is about, if any.
 *
 * A policy belongs to a bucket because its expression quotes the bucket's name. That is text
 * matching over SQL, not a relation the database models, so it is wrong in both directions: a
 * policy saying `owner = 'avatars'` matches a bucket called `avatars`, and a policy that names no
 * bucket matches none.
 *
 * Being wrong must mean "shown in the other group", never "not shown" — which is why the unmatched
 * ones have a section of their own rather than being filtered away.
 */
export function policyBuckets(policy: Policy, buckets: string[]): string[] {
  const text = `${policy.using_expr ?? ""} ${policy.check_expr ?? ""}`;
  return buckets.filter((bucket) => text.includes(quoteLiteral(bucket)));
}

export type PolicyGroups = {
  byBucket: { bucket: string; policies: Policy[] }[];
  /** On `storage.objects`, naming no bucket this project has. */
  otherObjects: Policy[];
  /** On `storage.buckets`, which are never about one bucket. */
  onBuckets: Policy[];
};

export function groupPolicies(
  objects: Policy[],
  buckets_: Policy[],
  bucketNames: string[],
): PolicyGroups {
  const byBucket = bucketNames.map((bucket) => ({
    bucket,
    policies: objects.filter((p) => policyBuckets(p, [bucket]).length > 0),
  }));

  return {
    byBucket,
    otherObjects: objects.filter((p) => policyBuckets(p, bucketNames).length === 0),
    onBuckets: buckets_,
  };
}
