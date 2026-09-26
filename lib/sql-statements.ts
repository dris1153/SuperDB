// Explicit .ts extensions, unlike the rest of lib/: this module is reached from a node:test file
// through sql-write.ts, and Node has no bundler to fall back on.
import { quoteIdent, quoteQualified } from "./sql-ident.ts";
import type { ColumnInfo } from "./table-view.ts";
import {
  checkKnown,
  jsonLiteral,
  primaryKey,
  recordList,
  rejectGenerated,
  rejectTruncated,
  returningKey,
  type Row,
  type Statement,
} from "./sql-write.ts";

/**
 * The four statements the editor writes.
 *
 * Split from `sql-write.ts` for size; that module holds the primitives they are built from — the
 * literal, the guards, and the pieces of a record list.
 */

export function buildInsert(
  schema: string,
  table: string,
  columns: ColumnInfo[],
  rows: Row[],
): Statement {
  if (rows.length === 0) throw new Error("No rows to insert");
  rejectTruncated(rows);

  /**
   * Every row must name the same columns.
   *
   * A column reaches its DEFAULT only by being absent from the INSERT column list. Taking the union
   * across rows puts it in the list for *all* of them, and `jsonb_to_recordset` yields SQL NULL
   * wherever a row omitted the key — measured: a row omitting `made_at timestamptz default now()`
   * stored NULL, not the timestamp. That is silent data loss on a database with no undo.
   *
   * Splitting into one statement per key-set is not an option here either: a multi-statement request
   * returns only the last result set, so `RETURNING` would under-count. Callers with ragged rows —
   * a CSV import — group them and call once per group.
   */
  const names = Object.keys(rows[0]);
  if (names.length === 0) throw new Error("No columns to insert");
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length !== names.length || !names.every((n) => n in row)) {
      throw new Error(
        "Every row must supply the same columns — otherwise the ones it omits are written as NULL " +
          "instead of taking their default. Group the rows and insert each group separately.",
      );
    }
  }
  checkKnown(columns, names);
  rejectGenerated(columns, names);

  const idents = names.map(quoteIdent).join(", ");
  const returning = primaryKey(columns).map((c) => c.name);
  return {
    sql:
      `insert into ${quoteQualified(schema, table)} (${idents})\n` +
      `select ${idents}\n` +
      `from jsonb_to_recordset(${jsonLiteral(rows).sql}::jsonb) as x(${recordList(columns, names)})\n` +
      `returning ${returningKey(columns)};`,
    returning,
  };
}

export function buildUpdate(
  schema: string,
  table: string,
  columns: ColumnInfo[],
  key: Row,
  patch: Row,
): Statement {
  const keyNames = Object.keys(key);
  const patchNames = Object.keys(patch);
  // An UPDATE whose WHERE quietly disappears is how a table gets wiped, so this is a throw and not
  // a silently skipped statement.
  if (keyNames.length === 0) throw new Error("Refusing to build an UPDATE with no key");
  if (patchNames.length === 0) throw new Error("Nothing to set");
  checkKnown(columns, [...keyNames, ...patchNames]);
  rejectGenerated(columns, patchNames);
  rejectTruncated([key, patch]);

  const pk = primaryKey(columns).map((c) => c.name);
  if (pk.length === 0 || keyNames.length !== pk.length || !pk.every((n) => keyNames.includes(n))) {
    throw new Error("The key must be exactly the primary key");
  }

  /**
   * The key and the patch share one JSON object, so a column cannot hold two values at once — and
   * the key has to win, or the WHERE would look for the row's new identity and match nothing.
   *
   * That means an edit to a primary key column would be accepted, ignored, and reported as one row
   * updated. Refusing is the only honest option: changing a key needs a shape where old and new
   * travel under different names, which this one deliberately is not.
   */
  const touchesKey = patchNames.filter((n) => pk.includes(n));
  if (touchesKey.length > 0) {
    throw new Error(
      `Cannot change the primary key (${touchesKey.join(", ")}) — delete the row and insert it again.`,
    );
  }

  const fields = [...new Set([...patchNames, ...keyNames])];
  const sets = patchNames.map((n) => `${quoteIdent(n)} = x.${quoteIdent(n)}`).join(", ");
  const match = keyNames.map((n) => `t.${quoteIdent(n)} = x.${quoteIdent(n)}`).join(" and ");

  return {
    sql:
      `update ${quoteQualified(schema, table)} as t\n` +
      `set ${sets}\n` +
      `from jsonb_to_record(${jsonLiteral({ ...patch, ...key }).sql}::jsonb) as x(${recordList(columns, fields)})\n` +
      `where ${match}\n` +
      `returning ${returningKey(columns, "t.")};`,
    returning: pk,
  };
}

/**
 * How many rows a write by key will touch, counted before it runs.
 *
 * Deliberately shaped like the write itself — same keys, same join — so the preview cannot describe
 * something other than what is about to happen. It is meant for the **read-only** endpoint, which
 * cannot write even if this were wrong.
 */
/**
 * Reduces a caller's rows to just the primary key, and builds the join both the count and the delete
 * match on — one contract for "a key", rather than update requiring an exact key while these two
 * quietly discarded whatever else they were handed.
 */
function keyRows(columns: ColumnInfo[], keys: Row[], verb: string) {
  if (keys.length === 0) throw new Error(`No rows to ${verb}`);
  const pk = primaryKey(columns).map((c) => c.name);
  if (pk.length === 0) throw new Error("Table has no primary key, so rows cannot be addressed");
  for (const k of keys) {
    if (!pk.every((n) => n in k && k[n] !== undefined)) {
      throw new Error("Every row must carry the whole primary key");
    }
  }

  // Duplicate keys would make count(*) report more rows than exist. Deduplicating here keeps the
  // preview and the write agreeing on the same number.
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const k of keys) {
    const only = Object.fromEntries(pk.map((n) => [n, k[n]]));
    const id = JSON.stringify(pk.map((n) => only[n]));
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(only);
  }

  // After the narrowing, so it judges the columns this statement will actually match on. A shortened
  // key matches nothing: the count reads 0 and the delete removes nothing, both reporting success.
  // Run on the caller's raw rows it would also refuse a wide column the statement never mentions.
  rejectTruncated(rows);

  return { pk, rows, match: pk.map((n) => `t.${quoteIdent(n)} = x.${quoteIdent(n)}`).join(" and ") };
}

export function buildCount(
  schema: string,
  table: string,
  columns: ColumnInfo[],
  keys: Row[],
): string {
  const { pk, rows, match } = keyRows(columns, keys, "count");
  return (
    `select count(*)::int as n\n` +
    `from ${quoteQualified(schema, table)} as t\n` +
    `join jsonb_to_recordset(${jsonLiteral(rows).sql}::jsonb) as x(${recordList(columns, pk)})\n` +
    `on ${match};`
  );
}

export function buildDelete(
  schema: string,
  table: string,
  columns: ColumnInfo[],
  keys: Row[],
): Statement {
  const { pk, rows, match } = keyRows(columns, keys, "delete");
  return {
    sql:
      `delete from ${quoteQualified(schema, table)} as t\n` +
      `using jsonb_to_recordset(${jsonLiteral(rows).sql}::jsonb) as x(${recordList(columns, pk)})\n` +
      `where ${match}\n` +
      `returning ${returningKey(columns, "t.")};`,
    returning: pk,
  };
}
