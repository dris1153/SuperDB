import "server-only";
import { requireUser } from "./supabase/server";
import { isValidProjectOrder } from "./project-sort";

/**
 * The board's saved project order.
 *
 * Deliberately not a "use server" module. Every export there becomes an action the browser can call,
 * and a read used only by loadInventory has no business being one — the same reason write-audit.ts
 * stays out. The server-action wrappers live in the board page beside its other inline actions.
 */

/** Far above any plausible number of projects across every connected account; a bound, not a limit. */
const MAX_PROJECTS = 1000;


/**
 * Ref to position.
 *
 * Swallows its error into an empty map rather than throwing, unlike connectionsWithTokens beside it:
 * without tokens there is nothing to show at all, but without this there is still a whole board in
 * connection order. Taking the page down because a view preference could not be read is the wrong
 * trade. A permanently broken read surfaces as "dragging does not stick", so this is a deliberate
 * choice rather than a convenient one.
 */
export async function projectOrder(): Promise<Map<string, number>> {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from("project_order").select("project_ref, sort_order");
    if (error) return new Map();
    return new Map((data ?? []).map((row) => [row.project_ref as string, row.sort_order as number]));
  } catch {
    return new Map();
  }
}

/**
 * Writes the whole order in one statement through public.reorder_projects, which inserts rows that
 * do not exist yet — the first drag seeds every project at once.
 *
 * The refs come from the browser and a string[] type is erased at runtime, so they are checked here.
 * RLS bounds what a hostile array can reach, but an unbounded one makes the insert work for nothing,
 * and a malformed ref would sit in the table forever because nothing upstream will ever match it.
 */
export async function reorderProjects(refs: string[]): Promise<void> {
  if (!isValidProjectOrder(refs, MAX_PROJECTS)) throw new Error("Invalid project order");

  // Deduped rather than rejected: a repeat is normal, not hostile. GET /v1/projects is not scoped to
  // one organization and connections_identity includes `kind`, so an account connected by both PAT
  // and OAuth shows its projects twice on the board. The function guards this too — this keeps the
  // wire clean and the intent visible at the call site.
  const unique = [...new Set(refs)];

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("reorder_projects", { refs: unique });
  if (error) throw new Error(error.message);
}

/** Drops the saved order, returning the board to connection order. The policy scopes the delete. */
export async function resetProjectOrder(): Promise<void> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("project_order").delete().eq("user_id", user.id);
  if (error) throw new Error(error.message);
}
