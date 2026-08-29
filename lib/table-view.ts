// Explicit .ts extension, unlike the rest of lib/: this module is imported directly by a node:test
// file, and Node's resolver has no bundler to fall back on. Do not "tidy" it away.
import { quoteIdent, quoteLiteral } from "./sql-ident.ts";

/**
 * The Table Editor's pure half: column shape, page size, sort order, and the ORDER BY it builds.
 *
 * Deliberately outside `table-editor.ts`, which is `server-only` — the footer and the grid are client
 * components and need these as values, not just types. Same split, and the same reason, as
 * `project-status.ts`. Keeping `orderClause` here also makes it unit-testable without reaching the
 * Management API.
 */

export type SortKey = { column: string; dir: "asc" | "desc" };

export interface ColumnInfo {
  ordinal: number;
  name: string;
  /** Short name as the Supabase dashboard shows it in column headers: `int4`, `jsonb`, `uuid`. */
  short_type: string;
  /** Fully resolved with modifiers — `character varying(255)`. Belongs in detail views, not headers. */
  data_type: string;
  nullable: boolean;
  default_expr: string | null;
  is_pk: boolean;
  /** 1-based position within the primary key, in `conkey` order — not attnum order. Null when not a PK. */
  pk_pos: number | null;
  fk_target: string | null;
}

export const PAGE_SIZES = [100, 500] as const;
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = Math.max(...PAGE_SIZES);

/** `sort=id.asc,name.desc`. Unparseable entries are dropped rather than guessed at. */
export function parseSort(value: string | null | undefined): SortKey[] {
  if (!value) return [];
  const keys: SortKey[] = [];
  for (const part of value.split(",")) {
    const at = part.lastIndexOf(".");
    if (at <= 0) continue;
    const column = part.slice(0, at);
    const dir = part.slice(at + 1);
    if (dir === "asc" || dir === "desc") keys.push({ column, dir });
  }
  return keys;
}

export const serialiseSort = (keys: SortKey[]) =>
  keys.map((k) => `${k.column}.${k.dir}`).join(",");

/** SQL for each operator. `null` marks the two that take no value. */
const OPS = {
  eq: "=",
  neq: "<>",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  like: "like",
  ilike: "ilike",
  in: "in",
  isnull: null,
  notnull: null,
} as const;

export type FilterOp = keyof typeof OPS;
export type Filter = { column: string; op: FilterOp; value: string };

export const FILTER_OPS = Object.keys(OPS) as FilterOp[];
export const opTakesValue = (op: FilterOp) => OPS[op] !== null;

const OP_LABELS: Record<FilterOp, string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  lt: "less than",
  gte: "greater or equal",
  lte: "less or equal",
  like: "like",
  ilike: "ilike (case-insensitive)",
  in: "in (comma separated)",
  isnull: "is null",
  notnull: "is not null",
};
export const opLabel = (op: FilterOp) => OP_LABELS[op];

/**
 * `column.op.value`. The column is found by locating the first `.<op>.` marker rather than splitting
 * on dots, because both column names and values may contain them. A column whose name literally
 * contains something like `.eq.` cannot be filtered — it fails closed, dropping the filter rather
 * than guessing a split.
 */
export function parseFilters(values: string[]): Filter[] {
  const out: Filter[] = [];
  for (const raw of values) {
    for (const op of FILTER_OPS) {
      const marker = `.${op}.`;
      const at = raw.indexOf(marker);
      if (at <= 0) continue;
      out.push({ column: raw.slice(0, at), op, value: raw.slice(at + marker.length) });
      break;
    }
  }
  return out;
}

export const serialiseFilter = (f: Filter) =>
  `${f.column}.${f.op}.${opTakesValue(f.op) ? f.value : ""}`;

/**
 * Builds the WHERE clause.
 *
 * The literal is left untyped so Postgres coerces it to the column's own type: `"id" > '5'` compares
 * as an integer. Casting the column to text instead — which is the obvious way to get one quoting
 * rule for every type — would make '9' > '10' true. Only `like`/`ilike` cast, because pattern
 * matching genuinely needs text.
 */
export function whereClause(columns: ColumnInfo[], filters: Filter[]): string {
  const known = new Set(columns.map((c) => c.name));
  const parts: string[] = [];

  for (const f of filters) {
    if (!known.has(f.column)) continue;
    const ident = quoteIdent(f.column);

    if (f.op === "isnull") parts.push(`${ident} is null`);
    else if (f.op === "notnull") parts.push(`${ident} is not null`);
    else if (f.op === "in") {
      const items = f.value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      if (items.length > 0) parts.push(`${ident} in (${items.map(quoteLiteral).join(", ")})`);
    } else if (f.op === "like" || f.op === "ilike") {
      parts.push(`${ident}::text ${OPS[f.op]} ${quoteLiteral(f.value)}`);
    } else {
      parts.push(`${ident} ${OPS[f.op]} ${quoteLiteral(f.value)}`);
    }
  }

  return parts.length > 0 ? ` where ${parts.join(" and ")}` : "";
}

/**
 * LIMIT/OFFSET without ORDER BY is not stable: Postgres may hand back the same row on two pages and
 * never show another. The primary key is the natural order; without one the first column is the best
 * available proxy, and a table with no key and duplicate leading values can still shuffle between
 * pages under concurrent writes.
 */
export function orderClause(columns: ColumnInfo[], sort: SortKey[]): string {
  const known = new Set(columns.map((c) => c.name));
  const requested = sort.filter((s) => known.has(s.column));
  // Key order follows the constraint, not attnum: `primary key (b, a)` must order by b then a, or
  // Postgres sorts instead of walking the primary key index.
  const pk = columns
    .filter((c) => c.pk_pos != null)
    .sort((a, b) => (a.pk_pos ?? 0) - (b.pk_pos ?? 0))
    .map((c) => c.name);
  const tiebreak = pk.length > 0 ? pk : columns.length > 0 ? [columns[0].name] : [];

  const parts = requested.map((s) => `${quoteIdent(s.column)} ${s.dir}`);
  for (const name of tiebreak) {
    if (!requested.some((s) => s.column === name)) parts.push(`${quoteIdent(name)} asc`);
  }
  return parts.length > 0 ? ` order by ${parts.join(", ")}` : "";
}
