"use server";

import { resolveProject } from "./inventory";
import { describeTable } from "./table-editor";
import { fetchFullRow, type RowRecord } from "./table-rows";

/**
 * The full, untruncated version of one row.
 *
 * Fetched on demand rather than shipped with the page: the grid deliberately cuts wide values off in
 * SQL, so this is the only path to a complete value, and it is wanted for one row at a time.
 *
 * Authorisation rides on `resolveProject`, which only returns a token for a connection the signed-in
 * user owns — the same check every other project-scoped action makes.
 */
export async function getFullRow(
  ref: string,
  schema: string,
  table: string,
  key: Record<string, string>,
): Promise<{ row: RowRecord | null; error?: string }> {
  const found = await resolveProject(ref);
  if (!found) return { row: null, error: "Project not found." };

  try {
    const columns = await describeTable(found.token, ref, schema, table);
    if (columns.length === 0) return { row: null, error: "Table not found." };
    const row = await fetchFullRow(found.token, ref, schema, table, columns, key);
    // A table with no primary key has nothing to address a single row by.
    if (!row) return { row: null, error: "This row cannot be addressed without a primary key." };
    return { row };
  } catch {
    return { row: null, error: "Could not read this row." };
  }
}
