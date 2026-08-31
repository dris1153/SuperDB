"use server";

import { resolveProject } from "./inventory";
import { recordWrite } from "./write-audit";
import { buildDelete, buildInsert, buildUpdate } from "./sql-statements";
import type { Row, Statement } from "./sql-write";
import { describeTable, incomingRefs, type IncomingRef } from "./table-editor";
import { safe } from "./safe";
import { execute, previewAffected } from "./table-writes";

/**
 * The row-level write actions: insert, update, delete.
 *
 * DDL lives in `ddl-actions.ts` — it shares the audit helper and the authorisation check, but the
 * construction that makes values safe here does not apply to identifiers and type names.
 *
 * Authorisation rides on `resolveProject`, which only returns a token for a connection the signed-in
 * user owns — the same check every other project-scoped action makes. Schema, table and column names
 * are validated against the catalog *before* anything is built: quoting keeps a hostile name inert,
 * catalog validation keeps an unknown one from being asked about at all.
 *
 * Results are a discriminated shape rather than thrown errors, matching what the connect panels
 * already render inline.
 */

export type WriteResult = { ok: true; affected: number } | { ok: false; reason: string };

async function run(
  ref: string,
  schema: string,
  table: string,
  what: string,
  keys: Row[] | undefined,
  /** The count the user confirmed. The write is refused if the table no longer agrees. */
  expected: number | undefined,
  build: (columns: Awaited<ReturnType<typeof describeTable>>) => Statement,
): Promise<WriteResult> {
  const found = await resolveProject(ref);
  if (!found) return { ok: false, reason: "Project not found." };

  try {
    const columns = await describeTable(found.token, ref, schema, table);
    if (columns.length === 0) return { ok: false, reason: "Table not found." };

    /**
     * The number shown in the confirmation is checked again here, against the same keys.
     *
     * Without it "no write reaches the database without a preview the user confirmed" is a habit of
     * the UI rather than a property of this layer — a caller could skip the preview entirely, and
     * even an honest one leaves a window in which another writer changes the table.
     */
    if (expected !== undefined && keys?.length) {
      const now = await previewAffected(found.token, ref, schema, table, columns, keys);
      if (now !== expected) {
        return {
          ok: false,
          reason:
            `This would now affect ${now} row${now === 1 ? "" : "s"}, not the ${expected} you ` +
            `confirmed — the table changed. Nothing was written; check again.`,
        };
      }
    }

    const { affected } = await execute(found.token, ref, build(columns));
    await recordWrite({
      ref,
      schema,
      table,
      what,
      keys,
      outcome: `${affected} row${affected === 1 ? "" : "s"}`,
    });
    return { ok: true, affected };
  } catch (error) {
    // Postgres explains its own refusals better than this code could — a constraint name, a type
    // mismatch — so its message is surfaced rather than replaced.
    const reason = error instanceof Error ? error.message : "The write failed.";
    await recordWrite({ ref, schema, table, what, keys, outcome: `failed: ${reason.slice(0, 200)}` });
    return { ok: false, reason: reason.slice(0, 400) };
  }
}

/** Inserting has nothing to preview — the rows do not exist yet, so there is no count to confirm. */
export async function insertRows(ref: string, schema: string, table: string, rows: Row[]) {
  return run(ref, schema, table, "insert into", undefined, undefined, (columns) =>
    buildInsert(schema, table, columns, rows),
  );
}

export async function updateRow(
  ref: string,
  schema: string,
  table: string,
  key: Row,
  patch: Row,
  expected = 1,
) {
  return run(ref, schema, table, "update", [key], expected, (columns) =>
    buildUpdate(schema, table, columns, key, patch),
  );
}

export async function deleteRows(
  ref: string,
  schema: string,
  table: string,
  keys: Row[],
  expected: number,
) {
  return run(ref, schema, table, "delete from", keys, expected, (columns) =>
    buildDelete(schema, table, columns, keys),
  );
}

/** What a delete would also reach. Read-only; the confirmation shows it before anything happens. */
export async function deleteImpact(
  ref: string,
  schema: string,
  table: string,
): Promise<IncomingRef[]> {
  const found = await resolveProject(ref);
  if (!found) return [];
  return (await safe(() => incomingRefs(found.token, ref, schema, table))) ?? [];
}

/** What a write *will* touch, for the confirmation dialog. Runs read-only; changes nothing. */
export async function countAffected(
  ref: string,
  schema: string,
  table: string,
  keys: Row[],
): Promise<{ ok: true; n: number } | { ok: false; reason: string }> {
  const found = await resolveProject(ref);
  if (!found) return { ok: false, reason: "Project not found." };

  try {
    const columns = await describeTable(found.token, ref, schema, table);
    if (columns.length === 0) return { ok: false, reason: "Table not found." };
    return { ok: true, n: await previewAffected(found.token, ref, schema, table, columns, keys) };
  } catch (error) {
    // The preview stands immediately before a destructive step, so a caller that cannot show a
    // number needs to know *why* — "no primary key" and "the API call failed" call for different
    // responses, and collapsing them into one sentence leaves the dialog able to proceed regardless.
    const reason = error instanceof Error ? error.message : "Could not check how many rows this would affect.";
    return { ok: false, reason: reason.slice(0, 400) };
  }
}
