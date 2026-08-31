"use server";

import { resolveProject } from "./inventory";
import { readOnlyQuery, writeQuery } from "./mgmt-api";
import { quoteIdent, quoteQualified } from "./sql-ident";
import {
  addColumn as buildAddColumn,
  alterColumn as buildAlterColumn,
  createTable as buildCreateTable,
  dropColumn as buildDropColumn,
  dropTable as buildDropTable,
  setRls as buildSetRls,
} from "./ddl-statements";
import type { ColumnChange, NewColumn } from "./ddl-build";
import { listTypes } from "./ddl-types";
import { describeTable } from "./table-editor";
import { recordWrite } from "./write-audit";

/**
 * Schema changes.
 *
 * The client builds the same statement to show as a preview, but nothing it builds is sent: the
 * inputs come over and the statement is built again here, against a type list read from this
 * project's own catalog. A preview the user approved and a statement the server composed are two
 * different objects on purpose — otherwise "confirm this SQL" would mean "run whatever was posted".
 *
 * DDL reports no row count, so the result says only whether it ran. Every attempt is audited, the
 * failures included, for the same reason the row writes are.
 */

export type DdlResult = { ok: true } | { ok: false; reason: string };

/**
 * `needsTypes` keeps the catalog read off the paths that do not name a type. Without it a broken or
 * throttled read-only endpoint would block `disable RLS` and `drop table` — the two things most
 * likely to be wanted when something is wrong — over a list neither of them looks at.
 */
async function run(
  ref: string,
  schema: string,
  table: string,
  what: string,
  needsTypes: boolean,
  build: (types: string[]) => string,
): Promise<DdlResult> {
  const found = await resolveProject(ref);
  if (!found) return { ok: false, reason: "Project not found." };

  let sql = "";
  try {
    sql = build(needsTypes ? await listTypes(found.token, ref) : []);
    await writeQuery(found.token, ref, sql);
    // Trimmed to fit: `connection_events.detail` is capped at 500 characters, and a wide CREATE
    // TABLE would otherwise lose its tail to a silent cut rather than a deliberate one.
    await recordWrite({
      ref,
      schema,
      table,
      what,
      outcome: `ran: ${sql.replace(/\s+/g, " ").slice(0, 300)}`,
    });
    return { ok: true };
  } catch (error) {
    // Postgres explains a refused schema change better than this code could — a dependent view, a
    // constraint, a type it cannot convert — so its message is surfaced rather than replaced.
    const reason = error instanceof Error ? error.message : "The change failed.";
    const attempted = sql === "" ? what : sql.replace(/\s+/g, " ");
    await recordWrite({
      ref,
      schema,
      table,
      what,
      outcome: `failed: ${reason.slice(0, 200)} — ${attempted.slice(0, 200)}`,
    });
    return { ok: false, reason: reason.slice(0, 400) };
  }
}

/** The type names a column may be given on this project, for the pickers and the preview. */
export async function listColumnTypes(ref: string): Promise<string[]> {
  const found = await resolveProject(ref);
  if (!found) return [];
  try {
    return await listTypes(found.token, ref);
  } catch {
    return [];
  }
}

export async function createTable(
  ref: string,
  schema: string,
  table: string,
  columns: NewColumn[],
  rls: boolean,
): Promise<DdlResult> {
  return run(ref, schema, table, "create table", true, (types) =>
    buildCreateTable(schema, table, columns, types, { rls }),
  );
}

export async function addColumn(
  ref: string,
  schema: string,
  table: string,
  column: NewColumn,
): Promise<DdlResult> {
  return run(ref, schema, table, `add column ${column.name} to`, true, (types) =>
    buildAddColumn(schema, table, column, types),
  );
}

export async function alterColumn(
  ref: string,
  schema: string,
  table: string,
  column: string,
  change: ColumnChange,
): Promise<DdlResult> {
  return run(ref, schema, table, `alter column ${column} on`, true, (types) =>
    buildAlterColumn(schema, table, column, change, types),
  );
}

/**
 * The remaining-column count is read here rather than taken from the caller: it decides whether the
 * drop is possible at all, and a stale number from the browser would let the dialog promise one that
 * Postgres will refuse.
 */
export async function dropColumn(
  ref: string,
  schema: string,
  table: string,
  column: string,
): Promise<DdlResult> {
  const found = await resolveProject(ref);
  if (!found) return { ok: false, reason: "Project not found." };
  const columns = await describeTable(found.token, ref, schema, table);
  if (columns.length === 0) return { ok: false, reason: "Table not found." };

  return run(ref, schema, table, `drop column ${column} from`, false, () =>
    buildDropColumn(schema, table, column, columns.length),
  );
}

export async function dropTable(ref: string, schema: string, table: string): Promise<DdlResult> {
  return run(ref, schema, table, "drop table", false, () => buildDropTable(schema, table));
}

export async function setRls(
  ref: string,
  schema: string,
  table: string,
  enabled: boolean,
): Promise<DdlResult> {
  return run(ref, schema, table, `${enabled ? "enable" : "disable"} RLS on`, false, () =>
    buildSetRls(schema, table, enabled),
  );
}

/**
 * What a drop would lose: how many rows currently hold a value in this column.
 *
 * Dropping a column that holds data should not look like dropping an empty one. Read-only, and the
 * column name is checked against the catalog before it is quoted into the count — the same order
 * every other read here uses.
 */
export async function columnUsage(
  ref: string,
  schema: string,
  table: string,
  column: string,
): Promise<{ total: number; filled: number } | null> {
  const found = await resolveProject(ref);
  if (!found) return null;
  try {
    const columns = await describeTable(found.token, ref, schema, table);
    if (!columns.some((c) => c.name === column)) return null;

    const rows = await readOnlyQuery<{ total: number; filled: number }>(
      found.token,
      ref,
      `select count(*)::int as total,
              count(${quoteIdent(column)})::int as filled
         from ${quoteQualified(schema, table)};`,
    );
    return { total: Number(rows[0]?.total ?? 0), filled: Number(rows[0]?.filled ?? 0) };
  } catch {
    return null;
  }
}
