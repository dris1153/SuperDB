// Explicit .ts extensions: reached from a node:test file, as `ddl-statements.ts` is.
import { quoteIdent, quoteQualified } from "./sql-ident.ts";
import { checkName } from "./ddl-build.ts";

export const COMMANDS = ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"] as const;
export type PolicyCommand = (typeof COMMANDS)[number];

/** What Postgres accepts per command: SELECT and DELETE read rows, INSERT writes them, the rest do both. */
export const takesUsing = (c: PolicyCommand) => c !== "INSERT";
export const takesCheck = (c: PolicyCommand) => c === "INSERT" || c === "UPDATE" || c === "ALL";

export type DbPolicy = {
  name: string;
  command: PolicyCommand;
  permissive: boolean;
  /** Empty means `public`. */
  roles: string[];
  using: string | null;
  check: string | null;
};

export type PolicySpec = {
  schema: string;
  table: string;
  name: string;
  command: PolicyCommand;
  permissive: boolean;
  roles: string[];
  using: string;
  check: string;
};

/** `public` is a keyword here, not a role — quoted it would name a role that does not exist. */
function rolesSql(roles: string[], allowed: string[]): string {
  if (roles.length === 0 || roles.includes("public")) return "public";
  for (const r of roles) if (!allowed.includes(r)) throw new Error(`There is no role ${r}`);
  return roles.map(quoteIdent).join(", ");
}

function expressions(s: Pick<PolicySpec, "command" | "using" | "check">): string[] {
  const out: string[] = [];
  if (takesUsing(s.command) && s.using.trim()) out.push(`using (${s.using.trim()})`);
  if (takesCheck(s.command) && s.check.trim()) out.push(`with check (${s.check.trim()})`);
  return out;
}

export function createPolicySql(s: PolicySpec, allowedRoles: string[]): string {
  checkName(s.name, "policy name");
  if (s.command === "INSERT" ? !s.check.trim() : !s.using.trim()) {
    throw new Error(s.command === "INSERT" ? "An INSERT policy needs a WITH CHECK expression" : "This policy needs a USING expression");
  }
  return [
    `create policy ${quoteIdent(s.name)}`,
    `on ${quoteQualified(s.schema, s.table)}`,
    `as ${s.permissive ? "permissive" : "restrictive"}`,
    `for ${s.command.toLowerCase()}`,
    `to ${rolesSql(s.roles, allowedRoles)}`,
    ...expressions(s),
  ].join("\n") + ";";
}

const sameRoles = (a: string[], b: string[]) => [...a].sort().join(",") === [...b].sort().join(",");

/**
 * `alter policy` can change roles, the expressions and the name — never the command or whether it
 * is permissive, which is why the editor locks those. The rename goes last, so the first statement
 * still names the policy as it is.
 */
export function alterPolicySql(schema: string, table: string, before: DbPolicy, after: PolicySpec, allowedRoles: string[]): string {
  const target = quoteQualified(schema, table);
  const parts: string[] = [];
  if (!sameRoles(before.roles, after.roles)) parts.push(`to ${rolesSql(after.roles, allowedRoles)}`);
  if (takesUsing(before.command) && after.using.trim() !== (before.using ?? "").trim()) {
    if (!after.using.trim()) throw new Error("A USING expression cannot be removed, only changed");
    parts.push(`using (${after.using.trim()})`);
  }
  if (takesCheck(before.command) && after.check.trim() !== (before.check ?? "").trim()) {
    if (!after.check.trim()) throw new Error("A WITH CHECK expression cannot be removed, only changed");
    parts.push(`with check (${after.check.trim()})`);
  }

  const out = parts.length ? [`alter policy ${quoteIdent(before.name)}\non ${target}\n${parts.join("\n")};`] : [];
  if (after.name !== before.name) {
    checkName(after.name, "policy name");
    out.push(`alter policy ${quoteIdent(before.name)} on ${target} rename to ${quoteIdent(after.name)};`);
  }
  if (out.length === 0) throw new Error("Nothing has changed");
  return out.join("\n");
}

export const dropPolicySql = (schema: string, table: string, name: string) =>
  `drop policy ${quoteIdent(name)} on ${quoteQualified(schema, table)};`;
