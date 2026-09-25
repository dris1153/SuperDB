"use server";

import { bucketNameProblem } from "./buckets";
import { resolveProject } from "./inventory";
import { writeQuery } from "./mgmt-api";
import { listStorageBuckets } from "./storage-api";
import { attempt } from "./safe";
import {
  createPolicyStatement,
  dropPolicyStatement,
  policyNameProblem,
  templateById,
  STORAGE_TABLES,
  type StorageTable,
} from "./storage-policies";
import { recordWrite } from "./write-audit";

export type PolicyResult = { ok: true } | { ok: false; reason: string };

/**
 * Creating a storage policy.
 *
 * **The statement is built here, from a template id and a bucket name.** The dialog builds the same
 * one to show as a preview, and nothing it builds is sent — the rule `lib/ddl-actions.ts` states:
 * a preview the user approved and a statement the server composed are two different objects on
 * purpose, otherwise "confirm this SQL" would mean "run whatever was posted".
 *
 * Only `storage.objects` takes these: every template is about which objects a role may touch, and
 * `storage.buckets` policies are about listing buckets, which no template here covers.
 */
export async function createStoragePolicy(
  projectRef: string,
  templateId: string,
  bucket: string,
  name: string,
): Promise<PolicyResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const nameIssue = policyNameProblem(name);
  if (nameIssue) return { ok: false, reason: nameIssue };

  const bucketIssue = bucketNameProblem(bucket);
  if (bucketIssue) return { ok: false, reason: bucketIssue };

  const template = templateById(typeof templateId === "string" ? templateId : "");
  if (!template) return { ok: false, reason: "That is not a policy template." };

  // The bucket is checked against the project's own list rather than trusted. Half of what this
  // statement means is that name, and a policy scoped to a bucket that does not exist would sit in
  // the "names no bucket" section for ever with nothing explaining why.
  const known = await attempt(() => listStorageBuckets(projectRef));
  if (!known.ok) return { ok: false, reason: known.reason };
  if (!known.data.some((b) => b.id === bucket)) {
    return { ok: false, reason: "This project has no bucket by that name." };
  }

  // Built inside the boundary, like `lib/ddl-actions.ts` does: `quoteLiteral` throws on a NUL byte,
  // and a builder that throws outside it would skip the audit and reach the browser as an opaque
  // digest rather than a result.
  const result = await attempt(async () => {
    const sql = createPolicyStatement(template, bucket, name.trim());
    await writeQuery(found.token, projectRef, sql);
    return sql;
  });

  await recordWrite({
    ref: projectRef,
    schema: "storage",
    table: "objects",
    what: "storage policy",
    outcome: result.ok
      ? `ran: ${result.data.replace(/\s+/g, " ").slice(0, 300)}`
      : `create failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Dropping one.
 *
 * **Not always the safe direction.** Postgres ORs permissive policies together and ANDs restrictive
 * ones over the top, so dropping a permissive policy takes access away — but dropping a
 * *restrictive* one **widens** it. An earlier version of this comment claimed removing a policy is
 * always stricter, and used that to justify no confirmation at all. The caller confirms, and the
 * list marks which kind each policy is.
 *
 * The name is any policy on those two tables, not only one this app rendered. That is deliberate:
 * the same user can run `drop policy` in the SQL editor, so the list is not a boundary.
 */
export async function dropStoragePolicy(
  projectRef: string,
  table: StorageTable,
  name: string,
): Promise<PolicyResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  if (!STORAGE_TABLES.includes(table)) return { ok: false, reason: "That is not a storage table." };

  const nameIssue = policyNameProblem(name);
  if (nameIssue) return { ok: false, reason: nameIssue };

  const result = await attempt(async () => {
    const sql = dropPolicyStatement(table, name);
    await writeQuery(found.token, projectRef, sql);
    return sql;
  });

  await recordWrite({
    ref: projectRef,
    schema: "storage",
    table,
    what: "storage policy",
    outcome: result.ok
      ? `ran: ${result.data.slice(0, 300)}`
      : `drop failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
