/**
 * Serialising rows for download.
 *
 * Pure and testable — the values arrive already fetched, and nothing here talks to the database.
 *
 * CSV follows RFC 4180: CRLF between records, a field quoted when it contains a comma, a quote, CR
 * or LF, and interior quotes doubled. A field containing a newline is the case that breaks parsers
 * written around splitting on lines, and the one this app's own import will have to read back.
 */

type Row = Record<string, unknown>;

/** Postgres NULL writes as nothing; an empty string writes as `""`, so the two stay distinguishable. */
function field(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (text === "") return '""';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: string[], rows: Row[]): string {
  const header = columns.map(field).join(",");
  if (rows.length === 0) return header;
  const body = rows.map((row) => columns.map((c) => field(row[c])).join(",")).join("\r\n");
  return `${header}\r\n${body}`;
}

/** Column order is preserved so a JSON export reads in the same order as the grid. */
export function toJson(columns: string[], rows: Row[]): string {
  const ordered = rows.map((row) => {
    const out: Row = {};
    for (const c of columns) out[c] = row[c] ?? null;
    return out;
  });
  return JSON.stringify(ordered, null, 2);
}

/**
 * Above this an export stops and says so, rather than being silently cut short.
 *
 * Lives here rather than beside the server action: a `"use server"` module may only export async
 * functions, so a constant the client needs cannot be declared there.
 */
export const EXPORT_LIMIT = 10_000;
