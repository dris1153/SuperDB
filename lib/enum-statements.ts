// Explicit .ts extensions: reached from a node:test file, as `ddl-statements.ts` is.
import { quoteIdent, quoteLiteral, quoteQualified } from "./sql-ident.ts";
import { checkName } from "./ddl-build.ts";

export type EnumType = { name: string; comment: string | null; values: string[] };

/** A label is a literal, quoted; Postgres caps one at NAMEDATALEN - 1 bytes and refuses duplicates. */
function checkLabels(labels: string[], existing: string[] = []) {
  const seen = new Set(existing);
  for (const label of labels) {
    if (label === "") throw new Error("A value cannot be empty");
    const bytes = new TextEncoder().encode(label).length;
    if (bytes > 63) throw new Error(`"${label}" is ${bytes} bytes; a value can be at most 63`);
    if (seen.has(label)) throw new Error(`"${label}" is listed twice`);
    seen.add(label);
  }
}

const commentSql = (target: string, comment: string) =>
  `comment on type ${target} is ${comment.trim() ? quoteLiteral(comment.trim()) : "null"};`;

export function createEnumSql(schema: string, name: string, comment: string, values: string[]): string {
  checkName(name, "type name");
  if (values.length === 0) throw new Error("An enumerated type needs at least one value");
  checkLabels(values);

  const target = quoteQualified(schema, name);
  const out = [`create type ${target} as enum (${values.map(quoteLiteral).join(", ")});`];
  if (comment.trim()) out.push(commentSql(target, comment));
  return out.join("\n");
}

/**
 * Only what Postgres allows after creation: new values appended in order, the comment, and the
 * rename last so everything before it names the type as it still is.
 */
export function updateEnumSql(
  schema: string,
  before: EnumType,
  after: { name: string; comment: string; added: string[] },
): string {
  checkLabels(after.added, before.values);
  const target = quoteQualified(schema, before.name);
  const out = after.added.map((v) => `alter type ${target} add value ${quoteLiteral(v)};`);

  if (after.comment.trim() !== (before.comment ?? "").trim()) out.push(commentSql(target, after.comment));
  if (after.name !== before.name) {
    checkName(after.name, "type name");
    out.push(`alter type ${target} rename to ${quoteIdent(after.name)};`);
  }

  if (out.length === 0) throw new Error("Nothing has changed");
  return out.join("\n");
}

export const dropEnumSql = (schema: string, name: string) => `drop type ${quoteQualified(schema, name)};`;

export function readEnums(raw: unknown): EnumType[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    if (typeof row.name !== "string") return [];
    return [
      {
        name: row.name,
        comment: typeof row.comment === "string" ? row.comment : null,
        values: Array.isArray(row.values) ? row.values.filter((v): v is string => typeof v === "string") : [],
      },
    ];
  });
}
