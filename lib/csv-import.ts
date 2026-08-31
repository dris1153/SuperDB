// Explicit .ts extensions, unlike the rest of lib/: this module is imported directly by a node:test
// file, and Node's resolver has no bundler to fall back on. Do not "tidy" them away.
import { parseValue } from "./cell-value.ts";
import { BATCH_BYTES, type CsvCell, type CsvFile } from "./csv-parse.ts";
import type { ColumnInfo } from "./table-view.ts";

/**
 * Turning a parsed CSV into rows for `buildInsert`.
 *
 * There is no second SQL path here: an import is a multi-row insert and nothing more, so the rows go
 * through the same `jsonb_to_recordset` construction as a single row typed into the insert sheet.
 * What this module owns is everything *before* that — which CSV column feeds which table column, and
 * what a given piece of text should become.
 */

/**
 * Header **position** → table column name, or null for a CSV column that will not be imported.
 *
 * Keyed by index rather than by header text: two columns may share a name, and keying by the name
 * made them one control that silently took the rightmost value and dropped the other column.
 */
export type Mapping = (string | null)[];

export type ImportRow = Record<string, unknown>;
export type CellError = { line: number; column: string; message: string };

/** Spreadsheets write booleans a dozen ways; `parseValue` accepts the two the editor can show. */
const BOOL_TRUE = new Set(["true", "t", "yes", "y", "1", "on"]);
const BOOL_FALSE = new Set(["false", "f", "no", "n", "0", "off"]);

/** The types for which an empty field is a value rather than the absence of one. */
const TEXTUAL = new Set(["text", "varchar", "bpchar", "char", "citext", "name"]);

/**
 * A first guess at the mapping, matched on name without regard to case.
 *
 * Only a guess: it is shown and editable before anything is written, because an import that mapped
 * wrong silently is worse than no import at all.
 */
export function guessMapping(header: string[], columns: ColumnInfo[]): Mapping {
  const byLower = new Map(columns.map((c) => [c.name.toLowerCase(), c]));
  const taken = new Set<string>();

  return header.map((h) => {
    const match = byLower.get(h.trim().toLowerCase());
    // A generated column is offered by nothing: the write layer refuses it, so mapping to it would
    // only produce an error at the end of a long form.
    if (!match || match.generated || taken.has(match.name)) return null;
    taken.add(match.name);
    return match.name;
  });
}

/**
 * What one cell should become, given the column it lands in.
 *
 * An empty field is settled by the column's type before anything else. Measured against a live
 * database: `""` reaching an `int4` or a `timestamptz` fails the whole batch of 500 with no line
 * number, and `""` reaching a `jsonb` is *accepted* and stored as the JSON string `""` — a wrong
 * value, silently, with no undo. Only a textual column can hold an empty string, so only there does
 * the parser's quoted/unquoted distinction survive; everywhere else empty means absent.
 */
function cellValue(
  cell: CsvCell,
  column: ColumnInfo,
  emptyAsNull: boolean,
): { value: unknown } | { error: string } {
  const textual = TEXTUAL.has(column.short_type);
  // Whitespace alone is empty to every type but a textual one, where it is the value it looks like.
  // `Number("  ")` is 0, so without this a column of blanks would import as a column of zeroes.
  const blank = cell === null || (!textual && cell.trim() === "") || cell === "";

  if (blank) {
    // `toCsv` writes NULL as nothing and an empty string as `""`, so on a textual column the two
    // stay apart and only the unquoted one takes the import's choice. A NOT NULL column takes the
    // empty string rather than a NULL the database would only reject — the same call `parseValue`
    // makes for a field typed into the insert sheet.
    if (textual) return { value: cell === "" ? "" : emptyAsNull && column.nullable ? null : "" };
    if (column.nullable) return { value: null };
    return { error: `${column.name} cannot be null and this field is empty.` };
  }

  if (column.short_type === "bool") {
    const lower = cell.trim().toLowerCase();
    if (BOOL_TRUE.has(lower)) return { value: "true" };
    if (BOOL_FALSE.has(lower)) return { value: "false" };
    return { error: `${column.name} is boolean and "${cell}" is not a yes or a no.` };
  }

  return parseValue(column, cell);
}

/**
 * The rows an import will insert, and everything that stopped a row from being one.
 *
 * Ragged lines are left out rather than padded — a short row padded with nulls writes nulls over
 * columns nobody mentioned — and their line numbers come back so the sheet can name them. Every
 * remaining row supplies exactly the same columns, which is what `buildInsert` requires and why it
 * requires it: a column absent from one row would be written as NULL instead of taking its default.
 */
export function buildImportRows(
  file: CsvFile,
  mapping: Mapping,
  columns: ColumnInfo[],
  opts: { emptyAsNull: boolean },
): { rows: ImportRow[]; errors: CellError[]; skipped: number[] } {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const used = file.header
    .map((_, i) => ({ target: mapping[i] ?? null, index: i }))
    .filter((m): m is { target: string; index: number } => m.target != null);

  // With nothing mapped there is nothing to insert. Producing a row of `{}` per line instead let the
  // confirmation promise N rows and `buildInsert` then refuse the lot with "no columns to insert" —
  // reachable by clearing every control, or by a semicolon-delimited file nothing matched.
  if (used.length === 0) return { rows: [], errors: [], skipped: [...file.ragged] };

  const rows: ImportRow[] = [];
  const errors: CellError[] = [];
  const skipped = [...file.ragged];
  const raggedLines = new Set(file.ragged);

  file.rows.forEach((cells, i) => {
    const line = i + 2;
    if (raggedLines.has(line)) return;

    const row: ImportRow = {};
    let failed = false;
    for (const { target, index } of used) {
      const column = byName.get(target);
      if (!column) continue;
      const result = cellValue(cells[index], column, opts.emptyAsNull);
      if ("error" in result) {
        errors.push({ line, column: target, message: result.error });
        failed = true;
        continue;
      }
      row[target] = result.value;
    }
    if (!failed) rows.push(row);
  });

  return { rows, errors, skipped };
}

/**
 * Splits into the batches an import sends one at a time, so progress is real rather than implied.
 *
 * Bounded by encoded size as well as row count. Each batch travels as a server action's POST body,
 * and Next caps those at 1 MB by default — measured: 500 rows carrying a 2 KB text column is 987 KB,
 * which the row cap alone would have waved through into a 413 the sheet could only report as "the
 * request failed before it answered".
 *
 * A single row over the byte budget still goes out alone: splitting it is not possible, and letting
 * the server refuse it names the row, which is more use than refusing it here without one.
 */
export function batch<T>(rows: T[], size: number, bytes = BATCH_BYTES): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let used = 0;

  for (const row of rows) {
    const cost = JSON.stringify(row).length + 1;
    if (current.length > 0 && (current.length >= size || used + cost > bytes)) {
      out.push(current);
      current = [];
      used = 0;
    }
    current.push(row);
    used += cost;
  }
  if (current.length > 0) out.push(current);
  return out;
}
