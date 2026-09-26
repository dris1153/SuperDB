// Explicit .ts extensions, unlike the rest of lib/: this module is reached from a node:test file,
// and Node's resolver has no bundler to fall back on. Do not "tidy" them away.
import { quoteIdent, quoteQualified } from "./sql-ident.ts";
import {
  checkName,
  columnClause,
  type NewColumn,
} from "./ddl-build.ts";

/**
 * The schema changes the editor can make.
 *
 * Split from `ddl-build.ts` for size; that module holds the pieces these are assembled from — the
 * name and type checks, and the clause one column turns into.
 */

/**
 * `create table`, plus the RLS statement when it is asked for.
 *
 * Two statements in one string: the endpoint runs them together and returns only the last result,
 * which nothing here reads. Leaving RLS to a second round trip would leave a window in which the
 * table exists unprotected.
 */
export function createTable(
  schema: string,
  table: string,
  columns: NewColumn[],
  allowed: string[],
  opts: { rls: boolean },
): string {
  checkName(table, "table name");
  if (columns.length === 0) throw new Error("A table needs at least one column");

  const names = new Set<string>();
  for (const c of columns) {
    if (names.has(c.name)) throw new Error(`Duplicate column: ${c.name}`);
    names.add(c.name);
  }

  const pk = columns.filter((c) => c.primaryKey).map((c) => c.name);
  const target = quoteQualified(schema, table);
  const body = [
    ...columns.map((c) => `  ${columnClause(c, allowed)}`),
    ...(pk.length > 0 ? [`  primary key (${pk.map(quoteIdent).join(", ")})`] : []),
  ].join(",\n");

  return (
    `create table ${target} (\n${body}\n);` +
    (opts.rls ? `\nalter table ${target} enable row level security;` : "")
  );
}

export function dropColumn(
  schema: string,
  table: string,
  column: string,
  remaining: number,
): string {
  checkName(column, "column name");
  // Postgres refuses to drop the last column, but it does so after the confirmation has already
  // promised the drop. Saying it here means the dialog never offers something that cannot happen.
  if (remaining <= 1) throw new Error("A table must keep at least one column");
  return `alter table ${quoteQualified(schema, table)} drop column ${quoteIdent(column)};`;
}

export const dropTable = (schema: string, table: string) =>
  `drop table ${quoteQualified(schema, table)};`;

export const setRls = (schema: string, table: string, enabled: boolean) =>
  `alter table ${quoteQualified(schema, table)} ${enabled ? "enable" : "disable"} row level security;`;
