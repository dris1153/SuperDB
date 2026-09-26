import "server-only";
import { resolveProject } from "./inventory";
import { writeQuery } from "./mgmt-api";
import { listTypes } from "./ddl-types";
import { recordWrite } from "./write-audit";

export type DdlResult = { ok: true } | { ok: false; reason: string };

/**
 * `needsTypes` keeps the catalog read off the paths that do not name a type. Without it a broken or
 * throttled read-only endpoint would block `disable RLS` and `drop table` — the two things most
 * likely to be wanted when something is wrong — over a list neither of them looks at.
 */
export async function run(
  ref: string,
  schema: string,
  table: string,
  what: string,
  needsTypes: boolean,
  // The token is for builders that read the catalog first — a duplicate needs the source's keys.
  build: (types: string[], token: string) => string | Promise<string>,
): Promise<DdlResult> {
  const found = await resolveProject(ref);
  if (!found) return { ok: false, reason: "Project not found." };

  let sql = "";
  try {
    sql = await build(needsTypes ? await listTypes(found.token, ref) : [], found.token);
    await writeQuery(found.token, ref, sql);
    // Trimmed to fit: `connection_events.detail` is capped at 500 characters, and a wide CREATE
    // TABLE would otherwise lose its tail to a silent cut rather than a deliberate one.
    await recordWrite({
      ref,
      schema,
      table,
      what,
      outcome: `ran: ${sql.replace(/\s+/g, " ").slice(0, 300)}`,
    });
    return { ok: true };
  } catch (error) {
    // Postgres explains a refused schema change better than this code could — a dependent view, a
    // constraint, a type it cannot convert — so its message is surfaced rather than replaced.
    const reason = error instanceof Error ? error.message : "The change failed.";
    const attempted = sql === "" ? what : sql.replace(/\s+/g, " ");
    await recordWrite({
      ref,
      schema,
      table,
      what,
      outcome: `failed: ${reason.slice(0, 200)} — ${attempted.slice(0, 200)}`,
    });
    return { ok: false, reason: reason.slice(0, 400) };
  }
}
