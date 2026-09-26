"use server";

import { run, type DdlResult } from "./ddl-run";
import { alterPolicySql, createPolicySql, dropPolicySql } from "./policy-statements";
import { readPolicySpec } from "./policy-model";
import { listTablePolicies } from "./policies-sql";

/**
 * Policies, through the same `run` as every schema change. Role names are checked against the
 * catalog the server reads now, and an edit starts from the policy as the catalog has it.
 */
export async function createPolicy(ref: string, spec: unknown): Promise<DdlResult> {
  const s = readPolicySpec(spec);
  if (!s) return { ok: false, reason: "That is not a policy the editor could have sent." };
  return run(ref, s.schema, s.table, `create policy ${s.name} on`, false, async (_types, token) =>
    createPolicySql(s, (await listTablePolicies(token, ref, s.schema)).roles),
  );
}

export async function updatePolicy(ref: string, schema: string, table: string, name: string, spec: unknown): Promise<DdlResult> {
  const s = readPolicySpec(spec);
  if (!s) return { ok: false, reason: "That is not a policy the editor could have sent." };
  return run(ref, schema, table, `alter policy ${name} on`, false, async (_types, token) => {
    const part = await listTablePolicies(token, ref, schema);
    const before = part.tables.find((t) => t.name === table)?.policies.find((p) => p.name === name);
    if (!before) throw new Error(`There is no policy ${name} on ${schema}.${table}`);
    return alterPolicySql(schema, table, before, s, part.roles);
  });
}

export async function dropPolicy(ref: string, schema: string, table: string, name: string): Promise<DdlResult> {
  return run(ref, schema, table, `drop policy ${name} on`, false, () => dropPolicySql(schema, table, name));
}
