import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { clampInt, quoteIdent, quoteLiteral, quoteQualified } from "./sql-ident";
import type { ColumnInfo, SortKey } from "./table-view";
import type { Filter } from "./table-filter";
import { DEFAULT_PAGE_SIZE, MAX_CELL_CHARS, MAX_PAGE_SIZE, orderClause } from "./table-view";
import { whereClause } from "./table-filter";
import type { TableKind } from "./table-editor";

/**
 * Reading rows, as opposed to reading the catalog that describes them.
 *
 * Split from `table-editor.ts` to keep both under the repo's 200-line rule; the catalog queries there
 * answer "what is in this database", these answer "what is in this table".
 */

export type RowRecord = Record<string, unknown>;
/**
 * Types whose values have no useful upper bound. They are truncated in SQL rather than in the
 * browser: 500 rows of a megabyte-wide `jsonb` column is a payload problem long before it is a
 * rendering one, and the grid virtualises the DOM so it would look fine right up until it did not.
 */
const WIDE_TYPES = new Set(["text", "varchar", "bpchar", "citext", "json", "jsonb", "xml", "bytea"]);

/** Exact counts are O(n); past this many estimated rows the footer shows an approximation instead. */
const EXACT_COUNT_CEILING = 50_000;

/** An array type is `_text`, `_jsonb` and so on — just as unbounded as its element type. */
const isWide = (shortType: string) =>
  WIDE_TYPES.has(shortType) || (shortType.startsWith("_") && WIDE_TYPES.has(shortType.slice(1)));

/**
 * An explicit select list rather than `select *`, so wide values can be cut off in the database.
 * The ellipsis is added by Postgres, which means a value that merely happens to end in one is not
 * mistaken for a truncated one by the renderer.
 */
function selectList(columns: ColumnInfo[]): string {
  if (columns.length === 0) return "*";
  return columns
    .map((c) => {
      const ident = quoteIdent(c.name);
      if (!isWide(c.short_type)) return ident;
      return (
        `case when pg_catalog.length(${ident}::text) > ${MAX_CELL_CHARS}` +
        ` then pg_catalog.left(${ident}::text, ${MAX_CELL_CHARS}) || '…'` +
        ` else ${ident}::text end as ${ident}`
      );
    })
    .join(", ");
}

export function selectRows(
  token: string,
  ref: string,
  schema: string,
  table: string,
  opts: {
    columns: ColumnInfo[];
    sort: SortKey[];
    filters: Filter[];
    search?: string;
    limit: number;
    offset: number;
    /** Off only for export, which must not hand over silently shortened values. */
    truncate?: boolean;
    max?: number;
  },
) {
  const limit = clampInt(opts.limit, 1, opts.max ?? MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const offset = clampInt(opts.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  const list = opts.truncate === false ? "*" : selectList(opts.columns);
  const sql =
    `select ${list} from ${quoteQualified(schema, table)}` +
    `${whereClause(opts.columns, opts.filters, opts.search)}` +
    `${orderClause(opts.columns, opts.sort)}` +
    ` limit ${limit} offset ${offset};`;
  return readOnlyQuery<RowRecord>(token, ref, sql);
}

/**
 * One row, untruncated, addressed by its primary key. The grid cuts wide values off in SQL, so the
 * detail panel has to go back for the real thing — it is the only place a full value is wanted, and
 * only for one row at a time.
 */
export async function fetchFullRow(
  token: string,
  ref: string,
  schema: string,
  table: string,
  columns: ColumnInfo[],
  key: Record<string, string>,
): Promise<RowRecord | null> {
  const pk = columns.filter((c) => c.pk_pos != null);
  if (pk.length === 0) return null;
  const predicates = pk.map((c) => `${quoteIdent(c.name)}::text = ${quoteLiteral(key[c.name] ?? "")}`);
  const rows = await readOnlyQuery<RowRecord>(
    token,
    ref,
    `select * from ${quoteQualified(schema, table)} where ${predicates.join(" and ")} limit 1;`,
  );
  return rows[0] ?? null;
}

export type RowCount = { n: number; exact: boolean } | { n: null; exact: false };

/**
 * Counting is only safe where `reltuples` can veto it, and `reltuples` is meaningful only for real
 * tables. Views and matviews report -1 (measured), and partitioned parents 0 or -1, because
 * autovacuum never analyses them — so an unguarded exact count would full-scan a view over fifty
 * million rows on every page render. For those, "unknown" is the honest answer.
 *
 * On a real table, -1 means never analysed, which almost always means new and small.
 */
export async function rowCount(
  token: string,
  ref: string,
  schema: string,
  table: string,
  opts: {
    kind: TableKind;
    estimate: number;
    columns?: ColumnInfo[];
    filters?: Filter[];
    search?: string;
  },
): Promise<RowCount> {
  const { kind, estimate, columns = [], filters = [], search = "" } = opts;
  const est = Number(estimate);
  if (kind !== "r") return { n: null, exact: false };
  const where = whereClause(columns, filters, search);
  // A filtered count cannot be estimated — reltuples describes the whole table. Above the ceiling
  // there is no cheap answer at all, so "unknown" beats scanning a large table on every render.
  if (est >= EXACT_COUNT_CEILING) return where === "" ? { n: est, exact: false } : { n: null, exact: false };
  const rows = await readOnlyQuery<{ n: number | string }>(
    token,
    ref,
    `select count(*)::bigint as n from ${quoteQualified(schema, table)}${where};`,
  );
  // bigint arrives as a string once it passes Number.MAX_SAFE_INTEGER, and as a number below it.
  return { n: Number(rows[0]?.n ?? 0), exact: true };
}
