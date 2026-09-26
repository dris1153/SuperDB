// Explicit .ts extensions, unlike the rest of lib/: this module is imported directly by a node:test
// file, and Node's resolver has no bundler to fall back on. Do not "tidy" them away.

/**
 * Reading a CSV, by hand.
 *
 * RFC 4180 is small and the repo has no parsing library, so this is a character scanner rather than
 * a line splitter. The case that decides it is a newline **inside** a quoted field: splitting on
 * lines first cuts such a record in half, and `table-export.ts` produces exactly that file, so the
 * app's own export has to read back.
 *
 * A cell is `null` when the field was empty **and unquoted**, and `""` when it was written as `""`.
 * That is the distinction `toCsv` makes — Postgres NULL writes as nothing, an empty string writes as
 * `""` — and keeping it is what lets an export round-trip unchanged. Callers that read a CSV from
 * elsewhere, where nobody meant that, collapse the two with one explicit choice.
 */

export type CsvCell = string | null;

export type CsvFile = {
  header: string[];
  rows: CsvCell[][];
  /** 1-based line numbers whose field count did not match the header. Reported, never padded. */
  ragged: number[];
};

/** Stated up front rather than discovered as a timeout. Larger belongs in psql or a migration. */
export const MAX_CSV_BYTES = 5_000_000;
export const MAX_CSV_ROWS = 50_000;
/** One INSERT per batch: the whole file in a single JSON literal is a request the endpoint refuses. */
export const IMPORT_BATCH = 500;
/**
 * And a batch is bounded by size too. A server action's POST body is capped at 1 MB by default, and
 * `next.config.ts` does not raise it; 700 KB leaves room for the rest of the request.
 */
export const BATCH_BYTES = 700_000;

export function parseCsv(text: string): CsvFile {
  // A BOM is what a spreadsheet writes and what would otherwise become part of the first header.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: CsvCell[][] = [];
  let row: CsvCell[] = [];
  let field = "";
  let quoted = false;
  let inQuotes = false;
  /** True once anything at all has been consumed for the record being built. */
  let started = false;
  let line = 1;
  let quoteLine = 0;

  const endField = () => {
    row.push(quoted || field !== "" ? field : null);
    field = "";
    quoted = false;
  };
  const endRecord = () => {
    endField();
    records.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        // A doubled quote is one literal quote; a single one closes the field.
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          // Text after the closing quote (`"a"b`) is dropped rather than treated as an error, which
          // is what every lenient parser does. It is the one malformation that yields a plausible
          // value, so the preview — which shows the parsed cells, not the file — is what catches it.
          inQuotes = false;
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }

    if (c === '"' && field === "") {
      inQuotes = true;
      quoted = true;
      started = true;
      quoteLine = line;
    } else if (c === ",") {
      endField();
      started = true;
    } else if (c === "\r" || c === "\n") {
      // A newline outside quotes always ends a record, whether the file uses CRLF or LF. A blank
      // line is therefore a record holding one empty field, not nothing: on a single-column file
      // that is a NULL row, and on a wider one it is reported as ragged. Skipping it instead lost
      // rows silently and left the count the confirmation shows too low.
      if (c === "\r" && src[i + 1] === "\n") i++;
      line++;
      endRecord();
    } else {
      field += c;
      started = true;
    }
  }

  // A field that opens a quote and never closes it swallows the whole rest of the file into one
  // value — no error, no ragged line, and a preview that truncates it out of sight. One stray quote
  // in a thousand-line file would import two rows and lose the other nine hundred and ninety-seven.
  if (inQuotes) {
    throw new Error(`A quoted field opened on line ${quoteLine} is never closed.`);
  }
  // Only a record still being built: after a newline nothing is started, so a trailing newline
  // produces no phantom record.
  if (started) endRecord();

  if (records.length === 0) return { header: [], rows: [], ragged: [] };
  if (records.length - 1 > MAX_CSV_ROWS) {
    throw new Error(
      `This file has more than ${MAX_CSV_ROWS.toLocaleString()} rows. Import it with psql instead.`,
    );
  }

  // A header cell is a column name, so an unquoted empty one is a name of nothing rather than NULL.
  const header = records[0].map((c) => c ?? "");
  const ragged: number[] = [];
  const rows = records.slice(1);
  rows.forEach((r, i) => {
    if (r.length !== header.length) ragged.push(i + 2);
  });

  return { header, rows, ragged };
}
