"use server";

import { resolveProject } from "./inventory";
import { MgmtError, readOnlyQuery, writeQuery } from "./mgmt-api";
import { recordWrite } from "./write-audit";
import { isReadOnlyRefusal, sqlErrorFromMgmt, type SqlError } from "./sql-error";
import { redactSqlSecrets } from "./sql-redact";

/**
 * Running a statement from the SQL editor.
 *
 * Read-only first, always. Whether a statement writes is not something a client can decide — a
 * function call writes, and so does a CTE, and so does a trigger three tables away — so the question
 * goes to Postgres instead. A read is answered with no interruption; a write comes back refused with
 * SQLSTATE 25006 and the caller confirms before it is sent again as a write.
 *
 * The refused attempt has no side effects: a read-only transaction rolls back. A write therefore
 * costs two round trips, which is a fair price for something rare and deliberate. The exception is
 * anything that leaves the transaction — `pg_notify`, an advisory lock, an `http` or `pg_net` call —
 * which fires on the probe as well as on the confirmed run.
 *
 * Nothing here previews or validates the SQL. This is the one page in the app where that is the
 * point, and docs/table-editor.md exists to explain why everywhere else is different.
 *
 * Authorisation rides on `resolveProject`, exactly as the table editor's writes do: it only returns
 * a token for a connection the signed-in user owns, so an unknown ref is answered before any SQL is
 * sent anywhere.
 */

export type Row = Record<string, unknown>;

export type RunResult =
  /** Rows came back. An empty array is a successful statement with no result set, not a failure. */
  | { status: "rows"; rows: Row[] }
  /** Valid SQL, but it writes. Confirm, then call again with `confirmed`. */
  | { status: "needs-confirmation" }
  /** Failed on its own terms — syntax, a missing relation, a permission. */
  | { status: "error"; error: SqlError };

const MAX_SQL = 100_000;

export async function runSql(
  ref: string,
  sql: string,
  /**
   * Skips the read-only attempt and writes. It is the UI's record of an answered question, not a
   * security boundary — the boundary is `resolveProject`, and a caller who sets this has the same
   * rights as one who clicked through the dialog. Which is why the audit is unconditional.
   */
  confirmed = false,
): Promise<RunResult> {
  if (typeof sql !== "string" || sql.trim() === "") {
    return { status: "error", error: { sqlstate: null, text: "Nothing to run", line: null, column: null } };
  }
  if (sql.length > MAX_SQL) {
    return {
      status: "error",
      error: { sqlstate: null, text: "Statement is too long to send", line: null, column: null },
    };
  }

  // resolveProject is the authorization gate: it only returns a token for a connection this user owns.
  const found = await resolveProject(ref);
  if (!found) return { status: "error", error: { sqlstate: null, text: "Unknown project", line: null, column: null } };

  if (confirmed) return write(found.token, ref, sql);

  try {
    return { status: "rows", rows: await readOnlyQuery<Row>(found.token, ref, sql) };
  } catch (e) {
    const error = toSqlError(e);
    // The one refusal that means "ask, then resend" rather than "this is wrong".
    return isReadOnlyRefusal(error) ? { status: "needs-confirmation" } : { status: "error", error };
  }
}

/**
 * Audited whether it succeeds or not: a request can time out after the write has committed, so a
 * failure here is not evidence that nothing happened. Same reasoning as the table editor's writes,
 * which go through the same recorder.
 */
async function write(token: string, ref: string, sql: string): Promise<RunResult> {
  // Trimmed like the table editor's: `connection_events.detail` is capped at 500 characters, so a
  // long statement loses its tail deliberately rather than to a silent cut. Redacted first, because
  // the event log is append-only and this is the one path that can run `alter user … password`.
  const statement = redactSqlSecrets(sql).replace(/\s+/g, " ").trim().slice(0, 300);
  try {
    const rows = await writeQuery<Row>(token, ref, sql);
    await recordWrite({ ref, what: "sql editor", outcome: `ran: ${statement}` });
    return { status: "rows", rows };
  } catch (e) {
    const error = toSqlError(e);
    await recordWrite({
      ref,
      what: "sql editor",
      // Redacted too: a syntax error quotes the fragment it choked on, which can be the literal.
      outcome: `failed: ${redactSqlSecrets(error.text).slice(0, 200)} — ${statement.slice(0, 200)}`,
    });
    return { status: "error", error };
  }
}

/** A non-MgmtError is a network or runtime fault, which has no sqlstate to find. */
const toSqlError = (e: unknown): SqlError =>
  e instanceof MgmtError
    ? sqlErrorFromMgmt(e.message)
    : { sqlstate: null, text: e instanceof Error ? e.message : "Query failed", line: null, column: null };
