import "server-only";
import { recordEvent } from "./audit";
import { createClient } from "./supabase/server";
import type { Row } from "./sql-write";

/**
 * Every attempt lands in `connection_events` — including the ones that failed.
 *
 * A write that errored still matters: a request can time out at the HTTP layer after the server has
 * committed, and without a record nothing in the system knows it was ever tried. The detail carries
 * the keys involved, because on an editor with no undo that trail is the only thing left to work
 * from.
 *
 * Not a server action, deliberately. It is exported so DML and DDL can share it, and a `"use server"`
 * module would make it callable from the browser with any text at all.
 */
export async function recordWrite(
  entry: {
    ref: string;
    what: string;
    outcome: string;
    keys?: Row[];
  } & // Both names or neither: the SQL editor has no single table to name, and a statement that
  // passed one of the two would lose the target from the audit line without the compiler noticing.
  ({ schema: string; table: string } | { schema?: undefined; table?: undefined }),
) {
  // Never throws. It runs *after* a statement has already committed, so letting it fail would turn a
  // write that succeeded into one the caller reports as failed — and, on a path with no undo, send
  // the user to retry a `drop table` that already happened. `recordEvent` swallows its own errors;
  // `createClient` and `getUser` do not, which is what this catch is for.
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const keys = entry.keys?.length ? ` keys=${JSON.stringify(entry.keys).slice(0, 200)}` : "";
    const target = entry.schema && entry.table ? ` ${entry.schema}.${entry.table}` : "";
    await recordEvent(supabase, {
      userId: data.user?.id,
      event: "wrote",
      detail: `${entry.what}${target} on ${entry.ref} — ${entry.outcome}${keys}`,
    });
  } catch {
    // Nothing to do with it here: the audit row is the record, and there is no second record to
    // note that the first could not be written.
  }
}
