// Explicit .ts extensions: reached from a node:test file.
import { COMMANDS, type DbPolicy, type PolicyCommand, type PolicySpec } from "./policy-statements.ts";

export const API_ROLES = ["anon", "authenticated", "service_role"] as const;
const API_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"];

export type PolicyTable = {
  name: string;
  rls: boolean;
  policies: DbPolicy[];
  /** Privileges each Data API role holds on the table. */
  grants: Record<string, string[]>;
};
export type PoliciesPart = { tables: PolicyTable[]; roles: string[] };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const isCommand = (v: unknown): v is PolicyCommand => COMMANDS.includes(v as PolicyCommand);

/**
 * `pg_get_expr` wraps a policy expression in one pair of brackets; the editor shows it without, as
 * the statement adds its own. Only a pair that encloses the whole expression is removed —
 * `(a) or (b)` keeps both of its own.
 */
export function unwrap(expr: string): string {
  const t = expr.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return t;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")") depth--;
    if (depth === 0 && i < t.length - 1) return t;
  }
  return t.slice(1, -1).trim();
}

export function readPolicies(raw: unknown): PoliciesPart {
  const doc = (raw ?? {}) as Record<string, unknown>;
  const tables = (Array.isArray(doc.tables) ? doc.tables : []).flatMap((t) => {
    const table = (t ?? {}) as Record<string, unknown>;
    if (!str(table.name)) return [];
    const grants = (table.grants ?? {}) as Record<string, unknown>;
    return [
      {
        name: str(table.name),
        rls: table.rls === true,
        grants: Object.fromEntries(API_ROLES.map((r) => [r, strings(grants[r])])),
        policies: (Array.isArray(table.policies) ? table.policies : []).flatMap((p) => {
          const policy = (p ?? {}) as Record<string, unknown>;
          if (!str(policy.name) || !isCommand(policy.command)) return [];
          return [
            {
              name: str(policy.name),
              command: policy.command,
              permissive: policy.permissive !== false,
              roles: strings(policy.roles).filter((r) => r !== "public"),
              using: typeof policy.using === "string" ? unwrap(policy.using) : null,
              check: typeof policy.check === "string" ? unwrap(policy.check) : null,
            },
          ];
        }),
      },
    ];
  });
  return { tables, roles: strings(doc.roles) };
}

export type DataApiStatus = "no-grants" | "custom-grants" | "publicly-readable" | "locked-by-rls" | "secured" | "unknown";

/**
 * The original's `getTableDataApiStatus`: fully granted means all three API roles hold all four
 * privileges. A schema that is not exposed, or whose exposure could not be read, stays silent.
 */
export function dataApiStatus(table: PolicyTable, exposed: boolean | null): DataApiStatus {
  if (exposed !== true) return "unknown";
  const held = API_ROLES.map((r) => table.grants[r] ?? []);
  if (held.every((p) => p.length === 0)) return "no-grants";
  if (!held.every((p) => API_PRIVILEGES.every((x) => p.includes(x)))) return "custom-grants";
  if (!table.rls) return "publicly-readable";
  return table.policies.length === 0 ? "locked-by-rls" : "secured";
}

export const hasApiAccess = (s: DataApiStatus) => s === "publicly-readable" || s === "locked-by-rls" || s === "secured";

export const specFromPolicy = (schema: string, table: string, p: DbPolicy): PolicySpec => ({
  schema,
  table,
  name: p.name,
  command: p.command,
  permissive: p.permissive,
  roles: p.roles,
  using: p.using ?? "",
  check: p.check ?? "",
});

/** What the browser posted, field by field. */
export function readPolicySpec(v: unknown): PolicySpec | null {
  const s = (v ?? {}) as Record<string, unknown>;
  const texts = ["schema", "table", "name", "using", "check"] as const;
  if (texts.some((k) => typeof s[k] !== "string" || (s[k] as string).length > 20_000)) return null;
  if (!isCommand(s.command) || typeof s.permissive !== "boolean") return null;
  if (!Array.isArray(s.roles) || s.roles.length > 100 || !s.roles.every((r) => typeof r === "string")) return null;
  return {
    schema: s.schema as string,
    table: s.table as string,
    name: s.name as string,
    command: s.command,
    permissive: s.permissive,
    roles: s.roles as string[],
    using: s.using as string,
    check: s.check as string,
  };
}
