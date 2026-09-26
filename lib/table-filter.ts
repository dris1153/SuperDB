// Explicit .ts extension, unlike the rest of lib/: this module is imported directly by a node:test
// file, and Node's resolver has no bundler to fall back on. Do not "tidy" it away.
import { quoteIdent, quoteLiteral } from "./sql-ident.ts";
import type { ColumnInfo } from "./table-view.ts";

/**
 * Filtering and free-text search: the operators, their URL form, and the WHERE clause they build.
 *
 * Split from `table-view.ts` for size, and because it is a separate concern — that module describes
 * the shape of a table and how it is ordered, this one describes which rows are asked for.
 */

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
export function whereClause(columns: ColumnInfo[], filters: Filter[], search = ""): string {
  const known = new Set(columns.map((c) => c.name));
  const parts: string[] = [];

  // Free-text search is a substring test, not a pattern: `strpos` rather than `ilike '%q%'` so a `%`
  // or `_` the user typed is matched literally instead of silently becoming a wildcard. Casting to
  // text is right here — a substring match on a number is a text operation by definition — and this
  // is a sequential scan by construction, which the UI says rather than hides.
  const term = search.trim();
  if (term !== "" && columns.length > 0) {
    const needle = quoteLiteral(term.toLowerCase());
    const any = columns
      .map((c) => `pg_catalog.strpos(pg_catalog.lower(${quoteIdent(c.name)}::text), ${needle}) > 0`)
      .join(" or ");
    parts.push(`(${any})`);
  }

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

