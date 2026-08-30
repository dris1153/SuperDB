import "server-only";
import { readOnlyQuery, writeQuery } from "./mgmt-api";
import { buildCount } from "./sql-statements";
import type { Row, Statement } from "./sql-write";
import type { ColumnInfo } from "./table-view";

/**
 * Running a write, and telling the truth about what it did.
 *
 * The write endpoint runs as `postgres`: full DDL rights, RLS bypassed. Nothing here is reachable
 * from the UI until phase 2 puts a confirmation in front of it.
 */

/**
 * How many rows the write is about to touch.
 *
 * Deliberately on the **read-only** endpoint. `BEGIN … ROLLBACK` does work on this API, so a true
 * dry run is possible, but a multi-statement request returns only the last result set — getting the
 * count back out of a rolled-back transaction needs contortions. A plain count over the same key is
 * exactly as accurate and cannot commit by accident.
 */
export async function previewAffected(
  token: string,
  ref: string,
  schema: string,
  table: string,
  columns: ColumnInfo[],
  keys: Row[],
): Promise<number> {
  const rows = await readOnlyQuery<{ n: number }>(
    token,
    ref,
    buildCount(schema, table, columns, keys),
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Runs the statement and counts what `RETURNING` handed back.
 *
 * The endpoint reports nothing of its own: a successful UPDATE without RETURNING answers `[]`, which
 * is indistinguishable from one that matched no rows. Only a `Statement` is accepted, so that the
 * promise comes from the builder that made it. Testing the SQL text for the word "returning" was the
 * obvious guard and the wrong one — the JSON payload sits in that same string, so a row value
 * containing it would satisfy the check.
 */
export async function execute(
  token: string,
  ref: string,
  statement: Statement,
): Promise<{ affected: number }> {
  const rows = await writeQuery(token, ref, statement.sql);
  // Not an array means the response was not understood — an empty body, or something new. Reporting
  // zero there would turn "no idea what happened" into a number that reads as certainty, about a
  // write that may well have committed.
  if (!Array.isArray(rows)) {
    throw new Error("The write ran but the database did not report what it affected");
  }
  return { affected: rows.length };
}

