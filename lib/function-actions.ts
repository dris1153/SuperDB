"use server";

import { resolveProject } from "./inventory";
import { run, type DdlResult } from "./ddl-run";
import { createFunctionSql, dropFunctionSql, updateFunctionSql, type FunctionOptions } from "./function-statements";
import { readFunctionSpec } from "./function-read";
import { functionOptions, listFunctions } from "./functions-sql";

/**
 * Database functions, through the same `run` as every schema change: rebuilt here from what was
 * posted and what the catalog says now, audited, failures included. The function's name stands in
 * the audit line's table column.
 */
export async function readFunctionOptions(ref: string): Promise<FunctionOptions> {
  const found = await resolveProject(ref);
  if (!found) return { types: [], languages: [] };
  try {
    return await functionOptions(found.token, ref);
  } catch {
    return { types: [], languages: [] };
  }
}

export async function createFunction(ref: string, spec: unknown): Promise<DdlResult> {
  const s = readFunctionSpec(spec);
  if (!s) return { ok: false, reason: "That is not a function the panel could have sent." };
  return run(ref, s.schema, s.name, `create ${s.kind}`, false, async (_types, token) =>
    createFunctionSql(s, await functionOptions(token, ref)),
  );
}

/** The function is found again by schema, name and identity arguments — an overload is never the wrong one. */
export async function updateFunction(ref: string, schema: string, name: string, identity: string, spec: unknown): Promise<DdlResult> {
  const s = readFunctionSpec(spec);
  if (!s) return { ok: false, reason: "That is not a function the panel could have sent." };
  return run(ref, schema, name, "update function", false, async (_types, token) => {
    const before = (await listFunctions(token, ref, schema)).find((f) => f.name === name && f.identity === identity);
    if (!before) throw new Error(`There is no function ${schema}.${name}(${identity})`);
    return updateFunctionSql(before, s, await functionOptions(token, ref));
  });
}

export async function dropFunction(ref: string, schema: string, name: string, identity: string): Promise<DdlResult> {
  return run(ref, schema, name, "drop function", false, async (_types, token) => {
    const f = (await listFunctions(token, ref, schema)).find((x) => x.name === name && x.identity === identity);
    if (!f) throw new Error(`There is no function ${schema}.${name}(${identity})`);
    return dropFunctionSql(f);
  });
}
