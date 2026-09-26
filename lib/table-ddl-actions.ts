"use server";

import { run, type DdlResult } from "./ddl-run";
import { duplicateTable as buildDuplicate, editTable as buildEdit, type TableState } from "./ddl-table-statements";
import { tableFacts } from "./table-facts-sql";
import { addColumnSql, alterColumnSql } from "./column-statements";
import { readColumnSpec } from "./column-facts";
import { columnFacts } from "./column-facts-sql";

/**
 * Edit and Duplicate from Database › Tables.
 *
 * Both read the table's current facts **here**, not from the browser: the preview was built from
 * the same read, but a statement is composed from what the catalog says now, as every schema change
 * in this app is. `run` audits it, failures included.
 */
export async function editTable(
  ref: string,
  schema: string,
  table: string,
  after: TableState,
): Promise<DdlResult> {
  return run(ref, schema, table, "edit table", false, async (_types, token) => {
    const facts = await tableFacts(token, ref, schema, table);
    if (!facts) throw new Error(`There is no table ${schema}.${table}`);
    const before = { name: table, comment: facts.comment ?? "", rls: facts.rls, realtime: facts.realtime };
    return buildEdit(schema, before, after);
  });
}

export async function duplicateTable(
  ref: string,
  schema: string,
  table: string,
  target: string,
  withData: boolean,
): Promise<DdlResult> {
  return run(ref, schema, table, `duplicate table as ${target}`, false, async (_types, token) => {
    const facts = await tableFacts(token, ref, schema, table);
    if (!facts) throw new Error(`There is no table ${schema}.${table}`);
    return buildDuplicate(schema, table, target, facts, withData === true);
  });
}

/**
 * The column panel's Save, for a new column (`column` null) or an existing one. What the browser
 * posted is checked field by field; `before` and the table's key are read here, now.
 */
export async function saveColumn(
  ref: string,
  schema: string,
  table: string,
  column: string | null,
  after: unknown,
): Promise<DdlResult> {
  const spec = readColumnSpec(after);
  if (!spec) return { ok: false, reason: "That is not a column the panel could have sent." };

  const what = column ? `alter column ${column} on` : `add column ${spec.name} to`;
  return run(ref, schema, table, what, true, async (types, token) => {
    const facts = await columnFacts(token, ref, schema, table, column ?? "");
    if (!facts.found) throw new Error(`There is no table ${schema}.${table}`);
    if (!column) return addColumnSql(schema, table, spec, facts, types);
    if (!facts.column) throw new Error(`There is no column ${column} on ${schema}.${table}`);
    return alterColumnSql(schema, table, facts.column, spec, facts, types);
  });
}
