"use server";

import { run, type DdlResult } from "./ddl-run";
import { createEnumSql, dropEnumSql, updateEnumSql } from "./enum-statements";
import { listEnums } from "./enum-types-sql";

/**
 * Enumerated types, through the same `run` as every schema change: rebuilt here from the inputs,
 * audited, failures included. The type's name stands in the audit line's table column.
 */
const texts = (v: unknown) => Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === "string" && x.length <= 200);

export async function createEnum(ref: string, schema: string, name: string, comment: string, values: string[]): Promise<DdlResult> {
  if (typeof name !== "string" || typeof comment !== "string" || !texts(values)) return { ok: false, reason: "That is not a type." };
  return run(ref, schema, name, "create type", false, () => createEnumSql(schema, name, comment, values));
}

/** The type is read again here: a value the browser thinks is new but already exists is refused. */
export async function updateEnum(
  ref: string,
  schema: string,
  name: string,
  after: { name: string; comment: string; added: string[] },
): Promise<DdlResult> {
  if (typeof after?.name !== "string" || typeof after.comment !== "string" || !texts(after.added)) {
    return { ok: false, reason: "That is not a change to a type." };
  }
  return run(ref, schema, name, "update type", false, async (_types, token) => {
    const before = (await listEnums(token, ref, schema)).find((e) => e.name === name);
    if (!before) throw new Error(`There is no type ${schema}.${name}`);
    return updateEnumSql(schema, before, after);
  });
}

export async function dropEnum(ref: string, schema: string, name: string): Promise<DdlResult> {
  return run(ref, schema, name, "drop type", false, () => dropEnumSql(schema, name));
}
