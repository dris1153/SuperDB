// Explicit .ts extensions: reached from a node:test file.
import { quoteLiteral } from "./sql-ident.ts";
import type { Behavior, ConfigParam, DbFunction, FunctionSpec } from "./function-statements.ts";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const isBehavior = (v: unknown): v is Behavior => v === "i" || v === "s" || v === "v";

/**
 * One `proconfig` entry as SQL that sets it back, as `pg_dump` writes it: each element a literal.
 * Written as it is stored — `search_path=public, extensions` — it would not survive a replace:
 * `""` (an empty path) is not SQL, and a value like `5s` is not a bare token.
 */
export function readConfig(entry: string): ConfigParam {
  const at = entry.indexOf("=");
  const name = at < 0 ? entry : entry.slice(0, at);
  const raw = at < 0 ? "" : entry.slice(at + 1);
  if (name !== "search_path") return { name, value: quoteLiteral(raw) };
  const items = raw.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
  return { name, value: items.map((s) => quoteLiteral(s)).join(", ") };
}

export function readFunctions(raw: unknown): DbFunction[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const f = (r ?? {}) as Record<string, unknown>;
    if (!str(f.name) || !str(f.schema)) return [];
    return [
      {
        schema: str(f.schema),
        name: str(f.name),
        kind: f.kind === "procedure" ? "procedure" : "function",
        args: str(f.args),
        identity: str(f.identity),
        result: typeof f.result === "string" ? f.result : null,
        language: str(f.language),
        behavior: isBehavior(f.behavior) ? f.behavior : "v",
        securityDefiner: f.securityDefiner === true,
        config: (Array.isArray(f.config) ? f.config : []).filter((c): c is string => typeof c === "string").map(readConfig),
        definition: str(f.definition),
      },
    ];
  });
}

/** Splits on commas outside brackets — `numeric(10,2)` is one type. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * `pg_get_function_arguments` text as the panel's argument rows, for Duplicate. Modes and defaults
 * are dropped, as the original's parser drops them; a type the catalog list does not know is left
 * for the panel to flag rather than guessed at.
 */
export function readArguments(args: string): { name: string; type: string }[] {
  return splitTopLevel(args).map((item) => {
    const bare = item.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, "").replace(/\s+DEFAULT\s+.*$/is, "");
    const match = bare.match(/^("(?:[^"]|"")+"|\S+)\s+(.+)$/);
    return match ? { name: match[1].replace(/^"(.*)"$/, "$1").replace(/""/g, '"'), type: match[2].trim() } : { name: "", type: bare };
  });
}

/** An existing function as the panel's draft. */
export const specFrom = (f: DbFunction): FunctionSpec => ({
  schema: f.schema,
  name: f.name,
  kind: f.kind,
  args: readArguments(f.args),
  returnType: f.result ?? "void",
  language: f.language,
  behavior: f.behavior,
  securityDefiner: f.securityDefiner,
  config: f.config,
  definition: f.definition,
});

export const blankFunction = (schema: string): FunctionSpec => ({
  schema,
  name: "",
  kind: "function",
  args: [],
  returnType: "void",
  language: "plpgsql",
  behavior: "v",
  securityDefiner: false,
  config: [],
  definition: "BEGIN\n\nEND;",
});

/** What the browser posted, checked field by field before the server builds anything from it. */
export function readFunctionSpec(v: unknown): FunctionSpec | null {
  const s = (v ?? {}) as Record<string, unknown>;
  const texts = ["schema", "name", "returnType", "language", "definition"] as const;
  if (texts.some((k) => typeof s[k] !== "string")) return null;
  if ((s.definition as string).length > 200_000) return null;
  if (s.kind !== "function" && s.kind !== "procedure") return null;
  if (!isBehavior(s.behavior) || typeof s.securityDefiner !== "boolean") return null;
  const pairs = (list: unknown, a: string, b: string) =>
    Array.isArray(list) && list.length <= 100 && list.every((x) => typeof x?.[a] === "string" && typeof x?.[b] === "string");
  if (!pairs(s.args, "name", "type") || !pairs(s.config, "name", "value")) return null;

  return {
    schema: s.schema as string,
    name: s.name as string,
    kind: s.kind,
    args: (s.args as { name: string; type: string }[]).map(({ name, type }) => ({ name, type })),
    returnType: s.returnType as string,
    language: s.language as string,
    behavior: s.behavior,
    securityDefiner: s.securityDefiner,
    config: (s.config as ConfigParam[]).map(({ name, value }) => ({ name, value })),
    definition: s.definition as string,
  };
}
