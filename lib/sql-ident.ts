/**
 * Identifier and integer handling for SQL built as text.
 *
 * The Management API's query endpoint takes a SQL string and offers no bind parameters, so every
 * schema, table and column name is interpolated. Quoting is not only injection defence: an unquoted
 * `MyTable` folds to lowercase and an unquoted `order` is a syntax error.
 */

/** Wraps a name as a Postgres identifier. Interior quotes are doubled, which is the only escape. */
export const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

export const quoteQualified = (schema: string, name: string) =>
  `${quoteIdent(schema)}.${quoteIdent(name)}`;

/**
 * Wraps a value as a Postgres string literal. Catalog lookups compare names as text
 * (`where n.nspname = 'public'`), so identifier quoting is the wrong tool there.
 *
 * Interior single quotes are doubled. Backslashes are left alone deliberately: with
 * standard_conforming_strings on — the default since 9.1 — they carry no escape meaning, and
 * doubling them would corrupt values that legitimately contain one. A NUL byte cannot survive the
 * round trip through Postgres at all, so it is rejected rather than silently mangled.
 */
export function quoteLiteral(value: string): string {
  if (value.includes("\0")) throw new Error("NUL byte in SQL literal");
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * LIMIT and OFFSET are interpolated too, so they must be integers within a known band. Anything that
 * is not a finite whole number — a float, a string with a statement glued on, NaN — takes the
 * fallback rather than reaching the query.
 */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
