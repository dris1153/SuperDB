// Explicit .ts extensions, unlike the rest of lib/: this module is reached from a node:test file,
// and Node's resolver has no bundler to fall back on. Do not "tidy" them away.
import { quoteIdent, quoteQualified } from "./sql-ident.ts";
import {
  checkName,
  checkType,
  columnClause,
  defaultClause,
  type ColumnChange,
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

export function addColumn(
  schema: string,
  table: string,
  column: NewColumn,
  allowed: string[],
): string {
  // `add column` has no way to declare a key, so a caller asking for one is told rather than having
  // the flag quietly dropped from a statement that then reports success.
  if (column.primaryKey) {
    throw new Error("A column cannot be added as a primary key; change the key separately");
  }
  // A column added to a table that already has rows cannot be NOT NULL without a default; Postgres
  // says so plainly, so the message is left to it rather than guessed at from a row count here.
  return `alter table ${quoteQualified(schema, table)} add column ${columnClause(column, allowed)};`;
}

/** One `alter table` with a part per change, so the whole edit succeeds or none of it does. */
export function alterColumn(
  schema: string,
  table: string,
  column: string,
  change: ColumnChange,
  allowed: string[],
): string {
  checkName(column, "column name");
  const target = quoteQualified(schema, table);
  const ident = quoteIdent(column);
  const parts: string[] = [];

  if (change.type !== undefined) {
    checkType(change.type, allowed);
    // `using` is deliberately absent: without it Postgres refuses a conversion it cannot make
    // implicitly, which is the right answer. A cast written here could silently truncate.
    parts.push(`alter column ${ident} type ${change.type}`);
  }
  if (change.nullable !== undefined) {
    parts.push(`alter column ${ident} ${change.nullable ? "drop" : "set"} not null`);
  }
  if (change.default !== undefined) {
    parts.push(
      change.default === "drop" || change.default === null
        ? `alter column ${ident} drop default`
        : `alter column ${ident} set default ${defaultClause(change.default)}`,
    );
  }

  // Renaming is its own statement — `alter table … rename column` cannot be combined with the rest.
  // It goes last so the parts above still name the column the caller was looking at.
  const rename = change.rename;
  if (rename !== undefined && rename !== column) checkName(rename, "column name");
  const renameSql =
    rename !== undefined && rename !== column
      ? `alter table ${target} rename column ${ident} to ${quoteIdent(rename)};`
      : null;

  if (parts.length === 0 && !renameSql) throw new Error("Nothing to change");

  return [parts.length > 0 ? `alter table ${target}\n  ${parts.join(",\n  ")};` : null, renameSql]
    .filter(Boolean)
    .join("\n");
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
