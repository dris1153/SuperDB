/**
 * Reads what the query endpoints say when a statement fails.
 *
 * There is no error code field to read. Measured 2026-09-12 with scripts/probe-query-errors.mjs, a
 * failure comes back as 400 with a single `message`, and the SQLSTATE is inside it:
 *
 *   Failed to run sql query: ERROR:  25006: cannot execute CREATE TABLE in a read-only transaction
 *   Failed to run sql query: ERROR:  42601: syntax error at or near "selec"
 *   LINE 1: selec 1
 *           ^
 *
 * Only the `ERROR:  <code>:` fragment is matched. Those five characters are Postgres's own output
 * format, not Supabase's prose, so the wrapper can be reworded without breaking this — which is what
 * makes the run flow safe to build on a string.
 *
 * The caret gives a position, which is how the editor can underline the offending token rather than
 * just printing a sentence. Getting that column off by one would look almost right, so it is worked
 * out from the matched prefix rather than from an assumed width.
 */

export type SqlError = {
  /** Five characters of SQLSTATE, or null when the message is not shaped like a Postgres error. */
  sqlstate: string | null;
  /** The first line of the error, without the wrapper or the code. Always something renderable. */
  text: string;
  /** 1-based, as Postgres reports it. Null when the error carries no position. */
  line: number | null;
  /** 1-based, from the caret's offset under the quoted line. */
  column: number | null;
};

const WRAPPER = /^Failed to run sql query:\s*/;
const SQLSTATE = /ERROR:\s+([0-9A-Z]{5}):\s*/;

/** `read_only_sql_transaction` — the statement was fine, it just wrote. */
export const READ_ONLY_REFUSAL = "25006";

/** Never throws: an unrecognised message still has to render somewhere. */
export function parseSqlError(message: string): SqlError {
  const raw = (message ?? "").replace(/\s+$/, "");
  const match = SQLSTATE.exec(raw);

  const after = match ? raw.slice(match.index + match[0].length) : raw.replace(WRAPPER, "");
  const text = after.split("\n")[0]?.trim() || raw.trim() || "Query failed";

  return { sqlstate: match?.[1] ?? null, text, ...position(raw) };
}

/**
 * The refusal that means "resend this to the write endpoint", not "your SQL is wrong". Deciding that
 * from the code rather than from the sentence is the whole reason the code is parsed at all.
 */
export const isReadOnlyRefusal = (error: SqlError) => error.sqlstate === READ_ONLY_REFUSAL;

/**
 * The same thing, starting from what MgmtError actually carries.
 *
 * `call()` builds its message as `${path} → ${status} ${body}` where the body is the raw HTTP text,
 * so the newlines Postgres sent are still the two characters `\` and `n` at that point. Reading the
 * caret out of that would find nothing and the text would trail a visible `\n"}`. Unwrap the JSON
 * first, then parse the real message.
 */
export function sqlErrorFromMgmt(message: string): SqlError {
  const start = (message ?? "").indexOf("{");
  if (start < 0) return parseSqlError(message);

  try {
    const body = JSON.parse(message.slice(start));
    if (typeof body?.message === "string") return parseSqlError(body.message);
  } catch {
    // Truncated at 2000 characters, or simply not JSON. The raw string still parses well enough for
    // the sqlstate, which is the part the run flow depends on.
  }
  return parseSqlError(message);
}

/**
 * Postgres quotes the offending line and marks the spot beneath it:
 *
 *   LINE 1: selec 1
 *           ^
 *
 * The caret's column is its offset in that second line minus the width of the `LINE n: ` prefix,
 * which varies with the line number's digits — hence measuring the matched prefix instead of
 * hardcoding eight.
 */
function position(raw: string): { line: number | null; column: number | null } {
  const lines = raw.split("\n");
  const index = lines.findIndex((l) => /^LINE \d+: /.test(l));
  if (index < 0) return { line: null, column: null };

  // A failure inside a function reports the position within *its* body, under a `QUERY:` line. That
  // line number does not index the document the user ran, so reporting it would underline an
  // unrelated token — better to say there is no position than to point at the wrong one.
  if (lines.slice(0, index).some((l) => /^QUERY:/.test(l))) return { line: null, column: null };

  const prefix = /^LINE (\d+): /.exec(lines[index])!;
  const caret = lines[index + 1]?.indexOf("^") ?? -1;

  return {
    line: Number(prefix[1]),
    column: caret < 0 ? null : Math.max(1, caret - prefix[0].length + 1),
  };
}
