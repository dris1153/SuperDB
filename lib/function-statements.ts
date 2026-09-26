// Explicit .ts extensions: reached from a node:test file, as `ddl-statements.ts` is.
import { quoteIdent, quoteQualified } from "./sql-ident.ts";
import { checkName } from "./ddl-build.ts";

export type Behavior = "i" | "s" | "v";
export const BEHAVIORS: { code: Behavior; label: string; sql: string }[] = [
  { code: "i", label: "Immutable", sql: "immutable" },
  { code: "s", label: "Stable", sql: "stable" },
  { code: "v", label: "Volatile", sql: "volatile" },
];

/** Pseudo-types a function may return that the catalog's column-type list leaves out. */
export const RETURN_PSEUDO = ["void", "record", "trigger", "event_trigger"];

export type ConfigParam = { name: string; value: string };

/** What the panel edits. `args` and `returnType` only count when creating. */
export type FunctionSpec = {
  schema: string;
  name: string;
  kind: "function" | "procedure";
  args: { name: string; type: string }[];
  returnType: string;
  language: string;
  behavior: Behavior;
  securityDefiner: boolean;
  config: ConfigParam[];
  definition: string;
};

/** A function as the catalog describes it; `args`, `identity` and `result` are Postgres's own text. */
export type DbFunction = {
  schema: string;
  name: string;
  kind: "function" | "procedure";
  args: string;
  identity: string;
  result: string | null;
  language: string;
  behavior: Behavior;
  securityDefiner: boolean;
  config: ConfigParam[];
  definition: string;
};

/** The allowlists a statement is checked against, read from the project on the server. */
export type FunctionOptions = { types: string[]; languages: string[] };

/**
 * A tag the body does not contain, so no text inside it can close the quote early. Nothing is added
 * inside the quotes: measured, a newline either side is stored in `prosrc`, and every save would add
 * two more.
 */
export function dollarQuote(body: string): string {
  let tag = "$function$";
  for (let i = 1; body.includes(tag); i++) tag = `$function${i}$`;
  return `${tag}${body}${tag}`;
}

function checkType(type: string, allowed: string[], extra: string[] = []) {
  const base = type.trim().replace(/\[\]$/, "");
  if (!allowed.includes(base) && !extra.includes(type.trim())) throw new Error(`Unknown type: ${type}`);
  return type.trim();
}

const CONFIG_NAME = /^[a-z_][a-z0-9_.]*$/i;

function tail(s: Pick<FunctionSpec, "kind" | "language" | "behavior" | "securityDefiner" | "config" | "definition">, languages: string[]) {
  if (!languages.includes(s.language)) throw new Error(`${s.language} is not a language this project has`);
  const lines = [`language ${quoteIdent(s.language)}`];
  // A procedure has no volatility — Postgres refuses the clause on one.
  if (s.kind === "function") lines.push(BEHAVIORS.find((b) => b.code === s.behavior)!.sql);
  lines.push(`security ${s.securityDefiner ? "definer" : "invoker"}`);
  for (const p of s.config) {
    if (!CONFIG_NAME.test(p.name)) throw new Error(`${p.name} is not a configuration parameter name`);
    if (!p.value.trim()) throw new Error(`${p.name} needs a value`);
    lines.push(`set ${p.name} = ${p.value.trim()}`);
  }
  return `${lines.join("\n")}\nas ${dollarQuote(s.definition)};`;
}

export function createFunctionSql(s: FunctionSpec, options: FunctionOptions): string {
  checkName(s.name, "function name");
  const args = s.args.map((a) => {
    checkName(a.name, "argument name");
    return `${quoteIdent(a.name)} ${checkType(a.type, options.types)}`;
  });
  const head = `create ${s.kind} ${quoteQualified(s.schema, s.name)}(${args.join(", ")})`;
  const returns = s.kind === "function" ? `\nreturns ${checkType(s.returnType, options.types, RETURN_PSEUDO)}` : "";
  return `${head}${returns}\n${tail(s, options.languages)}`;
}

/**
 * An existing function, changed. The signature — arguments and result — is the catalog's own text,
 * never the browser's: the original locks them, since a new signature is a new function. Replace
 * first, then rename, then move, so each statement names the function as it still is.
 */
export function updateFunctionSql(before: DbFunction, after: FunctionSpec, options: FunctionOptions): string {
  const out: string[] = [];
  const bodyChanged =
    after.definition !== before.definition ||
    after.language !== before.language ||
    (before.kind === "function" && after.behavior !== before.behavior) ||
    after.securityDefiner !== before.securityDefiner ||
    JSON.stringify(after.config) !== JSON.stringify(before.config);

  if (bodyChanged) {
    const returns = before.kind === "function" ? `\nreturns ${before.result}` : "";
    out.push(`create or replace ${before.kind} ${quoteQualified(before.schema, before.name)}(${before.args})${returns}\n${tail({ ...after, kind: before.kind }, options.languages)}`);
  }
  let name = before.name;
  if (after.name !== before.name) {
    checkName(after.name, "function name");
    out.push(`alter ${before.kind} ${quoteQualified(before.schema, name)}(${before.identity}) rename to ${quoteIdent(after.name)};`);
    name = after.name;
  }
  if (after.schema !== before.schema) {
    checkName(after.schema, "schema name");
    out.push(`alter ${before.kind} ${quoteQualified(before.schema, name)}(${before.identity}) set schema ${quoteIdent(after.schema)};`);
  }

  if (out.length === 0) throw new Error("Nothing has changed");
  return out.join("\n");
}

export const dropFunctionSql = (f: Pick<DbFunction, "kind" | "schema" | "name" | "identity">) =>
  `drop ${f.kind} ${quoteQualified(f.schema, f.name)}(${f.identity});`;
