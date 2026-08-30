// Explicit .ts extensions, unlike the rest of lib/: this module is imported directly by a node:test
// file, and Node's resolver has no bundler to fall back on. Do not "tidy" them away.
import type { ColumnInfo } from "./table-view.ts";

/**
 * Turning what someone typed into what the database should receive.
 *
 * Split from the control that renders it so it can be tested: this one function decides what every
 * write actually stores, and each of its type branches was written to fix a value that round-tripped
 * wrong. A branch nobody can test is a branch that breaks again.
 *
 * The values themselves are never quoted into SQL — `sql-write.ts` sends them as one JSON literal
 * and lets `jsonb_to_record` coerce each field from the catalog type. So the job here is only to
 * produce the right *JSON* shape, and the mistakes available are all of the form "this looked right
 * in the editor and stored something else".
 */

const JSON_TYPES = new Set(["json", "jsonb"]);
const NUMERIC = new Set(["int2", "int4", "int8", "float4", "float8", "numeric", "money"]);

export const isJsonColumn = (c: ColumnInfo) => JSON_TYPES.has(c.short_type);
export const isBoolColumn = (c: ColumnInfo) => c.short_type === "bool";
/**
 * From `format_type`, not the `_int4` naming convention: a user-defined type may legally be called
 * `_status`, and `data_type` cannot be spoofed by a type name.
 */
export const isArrayColumn = (c: ColumnInfo) => c.data_type.endsWith("[]");
export const isWideColumn = (c: ColumnInfo) =>
  isJsonColumn(c) || c.short_type === "text" || c.short_type === "xml";

/** `{ value }` on success, `{ error }` when the text cannot become what the column needs. */
export function parseValue(
  column: ColumnInfo,
  text: string,
): { value: unknown } | { error: string } {
  if (text === "") return { value: column.nullable ? null : "" };

  // The read path hands `jsonb` back as **text**, and sending text to a `jsonb` target stores a JSON
  // *string* rather than the value — measured: writing `"{\"a\":1}"` produced `jsonb_typeof =
  // string`. So it is parsed here, once, and a parse failure is reported rather than sent.
  if (isJsonColumn(column)) {
    try {
      return { value: JSON.parse(text) };
    } catch {
      return { error: `${column.name} is ${column.short_type} and this is not valid JSON.` };
    }
  }

  // An array reaches the editor in one of two notations, depending on its element type: `int4[]` is
  // read raw and arrives as a JS array shown as `[1,2]`, while `text[]` is wide, so `table-rows.ts`
  // casts it and it arrives as the Postgres literal `{urgent,billing}`. Both are accepted, because
  // Postgres accepts both — `jsonb_to_record` builds the array from a JSON array, and parses the
  // literal from a string. Mandating either one makes half the array columns uneditable.
  if (isArrayColumn(column)) {
    try {
      const value: unknown = JSON.parse(text);
      if (Array.isArray(value)) return { value };
    } catch {
      // Not JSON, so it is meant as a Postgres literal. Let Postgres be the judge of it.
    }
    return { value: text };
  }

  // Only the two forms the switch can show. `jsonb_to_record` would happily coerce "TRUE", "t" or
  // "yes" to true, but the confirmation renders `checked={value === "true"}` — so accepting them
  // means the control says false while the write says true.
  if (isBoolColumn(column)) {
    if (text === "true" || text === "false") return { value: text };
    return { error: `${column.name} is boolean — use true or false.` };
  }

  // Numbers go as JSON numbers so Postgres coerces from the right type. A value too large for a
  // double stays text — Postgres parses `numeric` and `int8` from a string perfectly well, and
  // rounding it here to look tidy would be data loss.
  if (NUMERIC.has(column.short_type)) {
    const n = Number(text);
    if (!Number.isFinite(n)) return { error: `${column.name} expects a number.` };
    return { value: Number.isSafeInteger(n) || Math.abs(n) < 2 ** 53 ? n : text };
  }

  return { value: text };
}

/** How an existing value is shown in an editor — the inverse of `parseValue`, as far as it goes. */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
