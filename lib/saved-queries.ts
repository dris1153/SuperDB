import "server-only";
import { requireUser } from "./supabase/server";
import { isProjectRef } from "./project-ref";

/**
 * The SQL editor's saved queries, scoped to one project.
 *
 * Not a `"use server"` module: the read is called by a server component, and every export of an
 * action module becomes callable from the browser. The action wrappers live in
 * `sql-editor-actions.ts` beside the run flow. Same split as `project-secrets.ts`.
 *
 * RLS scopes every statement to the caller; the `user_id` and `project_ref` filters here are belt
 * and braces alongside it, and they are what makes an id from another project a miss rather than a
 * cross-project edit.
 *
 * Every mutation answers with the fresh list. One round trip, no second fetch, and no optimistic
 * state machine to get wrong — the list is small enough that this is cheaper than reconciling.
 */

export type SavedQuery = {
  id: string;
  name: string;
  sql: string;
  favorite: boolean;
  updated_at: string;
};

const COLUMNS = "id, name, sql, favorite, updated_at";

/**
 * The sidebar's read ships every statement's full text, and a statement may be 100 kB. Without a
 * bound, a hundred saved queries would be ~10 MB on first paint and again after every star click.
 * Far more than anyone scrolls; a list this long needs paging, not a bigger payload.
 */
const MAX_LISTED = 200;

/** Matches the check constraints on the table, which are the real bound. */
const MAX_NAME = 120;
/** The same cap the run flow applies, so nothing can be saved that could not be sent. */
const MAX_SQL = 100_000;

export async function savedQueries(ref: string): Promise<SavedQuery[]> {
  if (!isProjectRef(ref)) return [];

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("saved_queries")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("project_ref", ref)
    .order("updated_at", { ascending: false })
    .limit(MAX_LISTED);
  if (error) throw new Error(error.message);

  return (data ?? []) as SavedQuery[];
}

/** The new id comes back with the list: the caller has to know which row it just created. */
export async function createSavedQuery(
  ref: string,
  name: string,
  sql: string,
): Promise<{ id: string; queries: SavedQuery[] }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("saved_queries")
    .insert({
      user_id: user.id,
      project_ref: checkedRef(ref),
      name: checkedName(name),
      sql: checkedSql(sql),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { id: (data as { id: string }).id, queries: await savedQueries(ref) };
}

/** Renaming and re-saving the statement are one update: both are "this query changed". */
export async function updateSavedQuery(
  ref: string,
  id: string,
  patch: { name?: string; sql?: string; favorite?: boolean },
) {
  checkedRef(ref);
  const fields = {
    ...(patch.name === undefined ? {} : { name: checkedName(patch.name) }),
    ...(patch.sql === undefined ? {} : { sql: checkedSql(patch.sql) }),
    ...(patch.favorite === undefined ? {} : { favorite: patch.favorite }),
  };
  if (Object.keys(fields).length === 0) return savedQueries(ref);

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("saved_queries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("project_ref", ref)
    .select("id");
  if (error) throw new Error(error.message);
  // `.select()` is what makes a miss visible: without it PostgREST answers a 0-row update happily,
  // and the UI would report a save that stored nothing — deleted in another tab, most likely.
  if ((data ?? []).length === 0) throw new Error("That query no longer exists. Save it as a new one.");

  return savedQueries(ref);
}

export async function deleteSavedQuery(ref: string, id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("saved_queries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("project_ref", checkedRef(ref))
    .select("id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error("That query is already gone.");

  return savedQueries(ref);
}

function checkedRef(ref: string) {
  if (!isProjectRef(ref)) throw new Error("Unknown project");
  return ref;
}

function checkedName(name: string) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed === "" || trimmed.length > MAX_NAME) throw new Error("Name must be 1 to 120 characters");
  return trimmed;
}

function checkedSql(sql: string) {
  if (typeof sql !== "string" || sql.trim() === "") throw new Error("Nothing to save");
  if (sql.length > MAX_SQL) throw new Error("Statement is too long to save");
  return sql;
}
