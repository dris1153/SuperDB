"use server";

import { run, type DdlResult } from "./ddl-run";
import { duplicateTable as buildDuplicate, editTable as buildEdit, type TableState } from "./ddl-table-statements";
import { tableFacts } from "./table-facts-sql";

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
