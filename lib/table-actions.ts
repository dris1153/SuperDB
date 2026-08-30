"use server";

import { resolveProject } from "./inventory";
import { EXPORT_LIMIT, toCsv, toJson } from "./table-export";
import { describeTable } from "./table-editor";
import { fetchFullRow, selectRows, type RowRecord } from "./table-rows";
import { parseSort } from "./table-view";
import { parseFilters } from "./table-filter";

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

/**
 * The current view as a downloadable string.
 *
 * Re-queries rather than serialising what is on screen: the grid holds values the database
 * truncated, and an export of silently shortened data is worse than no export at all. That is also
 * why this is the one caller that turns truncation off.
 *
 * `capped` is set when the export filled the limit exactly, which is the only signal available that
 * there may be more — so the UI can say the file is partial instead of letting it look complete.
 */
export async function exportRows(
  ref: string,
  schema: string,
  table: string,
  query: { sort?: string; filter?: string[]; search?: string },
  opts: { format: "csv" | "json"; scope: "page" | "all"; page: number; size: number },
): Promise<{ text: string; rows: number; capped: boolean } | { error: string }> {
  const found = await resolveProject(ref);
  if (!found) return { error: "Project not found." };

  try {
    const columns = await describeTable(found.token, ref, schema, table);
    if (columns.length === 0) return { error: "Table not found." };

    const known = new Set(columns.map((c) => c.name));
    const sort = parseSort(query.sort).filter((s) => known.has(s.column));
    const filters = parseFilters(query.filter ?? []).filter((f) => known.has(f.column));

    const all = opts.scope === "all";
    const rows = await selectRows(found.token, ref, schema, table, {
      columns,
      sort,
      filters,
      search: query.search,
      truncate: false,
      limit: all ? EXPORT_LIMIT : opts.size,
      offset: all ? 0 : (opts.page - 1) * opts.size,
      max: EXPORT_LIMIT,
    });

    const names = columns.map((c) => c.name);
    const text = opts.format === "csv" ? toCsv(names, rows) : toJson(names, rows);
    return { text, rows: rows.length, capped: all && rows.length === EXPORT_LIMIT };
  } catch {
    return { error: "Could not export these rows." };
  }
}
