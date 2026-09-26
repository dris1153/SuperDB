// Explicit .ts extension, unlike the rest of lib/: this module is imported directly by a node:test
// file, and Node's resolver has no bundler to fall back on. Do not "tidy" it away.
import { quoteIdent } from "./sql-ident.ts";

/**
 * The Table Editor's pure half: column shape, page size, sort order, and the ORDER BY it builds.
 *
 * Deliberately outside `table-editor.ts`, which is `server-only` — the footer and the grid are client
 * components and need these as values, not just types. Same split, and the same reason, as
 * `project-status.ts`. Keeping `orderClause` here also makes it unit-testable without reaching the
 * Management API.
 *
 * Which *rows* are asked for lives in `table-filter.ts`.
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
  /**
   * Postgres refuses a supplied value for these: a stored generated column, or an identity column
   * declared ALWAYS. Identity BY DEFAULT is not included — a value for it is accepted.
   */
  generated: boolean;
  /** 1-based position within the primary key, in `conkey` order — not attnum order. Null when not a PK. */
  pk_pos: number | null;
  /** The referenced column, when this one is a foreign key. All three are null together. */
  fk_schema: string | null;
  fk_table: string | null;
  fk_column: string | null;
  /** Every column pair of the constraint, in key order. Composite keys need all of them. */
  fk_pairs: { local: string; remote: string }[] | null;
}

/**
 * A foreign key is only navigable when the target and the full pair list came back. A partial answer
 * would build half a link, and a composite key filtered on one column lands on a row set.
 */
export const fkTarget = (c: ColumnInfo) =>
  c.fk_schema && c.fk_table && c.fk_column && c.fk_pairs && c.fk_pairs.length > 0
    ? { schema: c.fk_schema, table: c.fk_table, column: c.fk_column, pairs: c.fk_pairs }
    : null;

/**
 * Wide values are cut to this many characters in SQL, with `…` appended by Postgres. Shared so the
 * renderer can recognise a truncated value rather than guessing from the last character.
 */
export const MAX_CELL_CHARS = 512;

/**
 * A value the database shortened, rather than one that happens to end in an ellipsis.
 *
 * Counted in **code points**, because that is what `left()` counted. `String.length` counts UTF-16
 * units, so one emoji in the first 512 characters puts the cut value at 513 code points but 514
 * units — the test fails, the cell becomes editable, and the shortened value is written back over
 * the real one. Measured: a 512-character prefix of `repeat('🙂', 300) || repeat('a', 400)` arrives
 * with `.length === 813`.
 *
 * `endsWith` first so the spread only runs on candidates.
 */
export const isTruncated = (value: unknown) =>
  typeof value === "string" && value.endsWith("…") && [...value].length === MAX_CELL_CHARS + 1;

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

/**
 * Schemas the platform itself depends on. A write here is confirmed a second time — not blocked,
 * because repairing one broken `auth.users` row is a legitimate thing to need.
 *
 * Lives in this module rather than beside the write code because the confirmation dialog is a client
 * component and needs it as a value.
 */
const GUARDED = new Set(["auth", "storage"]);
export const isGuardedSchema = (schema: string) => GUARDED.has(schema);
