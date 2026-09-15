"use server";

import { revalidatePath } from "next/cache";
import { renameRemembered, resolveProject } from "./inventory";
import { restoreProject, updateProjectName } from "./mgmt-api";
import { dropProject } from "./part-cache";
import { attempt } from "./safe";

export type ResumeResult = { ok: true } | { ok: false; reason: string };
export type RenameResult = { ok: true; name: string } | { ok: false; reason: string };

/** The API's own bounds, and the app is not more permissive than they are. */
const NAME_MIN = 1;
const NAME_MAX = 256;

/**
 * Renaming a project.
 *
 * The call is one line. The rest of this function is the four places that hold the old name:
 *
 * - The `owners` memo in `inventory.ts`, which keeps the whole project body for a minute. It is
 *   corrected in place — see the comment there for why replacing it would not work inside the same
 *   request.
 * - The nav, which renders from `p/[ref]/layout.tsx`. A bare `revalidatePath` invalidates the *page*;
 *   reaching a layout and everything under it needs `type: "layout"`.
 * - The board, which lists every project by name.
 * - Not the part cache. `identity` is the one part with no reader and no cache entry —
 *   `part-cache.ts` types its table as `Exclude<Part, "identity">` — so `dropProject` would be a
 *   no-op here, and calling it would only look like diligence.
 *
 * Trimmed before the bounds are checked, because " " is a name the API accepts and nobody wants.
 */
export async function renameProject(projectRef: string, name: string): Promise<RenameResult> {
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN) return { ok: false, reason: "A project needs a name." };
  if (trimmed.length > NAME_MAX) {
    return { ok: false, reason: `That is longer than ${NAME_MAX} characters.` };
  }

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateProjectName(found.token, projectRef, trimmed));
  if (!result.ok) return { ok: false, reason: result.reason };

  await renameRemembered(projectRef, trimmed);
  revalidatePath(`/p/${projectRef}`, "layout");
  revalidatePath("/");
  return { ok: true, name: trimmed };
}

/**
 * Resuming is not destructive — nothing is overwritten and no data is lost — so it goes through on
 * one click, as it does in Supabase's own dashboard.
 *
 * It does fail routinely: a free organization allows two active projects, and the API refuses with
 * an explanation naming the members who are over the limit. That text is passed through untouched;
 * a paraphrase would be less useful than what Supabase already wrote.
 */
export async function resumeProject(projectRef: string): Promise<ResumeResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => restoreProject(found.token, projectRef));

  // Not a write to the database, but a change of state the cached reads describe: health and disk
  // answered for a paused project and would otherwise keep saying so for a minute after it came up.
  dropProject(projectRef);

  // "This project is no longer in a paused state, it is COMING_UP" is the API telling us the job is
  // already under way — someone used another tab, or this page was stale. Reporting that in red
  // would be the interface lying about what happened. Matched on Supabase's wording, so if they
  // reword it the worst case is the old red toast returning, not a wrong outcome.
  const alreadyGoing = !result.ok && /no longer in a paused state/i.test(result.reason);
  if (!result.ok && !alreadyGoing) return { ok: false, reason: result.reason };

  // The board counts active and paused projects, so it goes stale too.
  revalidatePath(`/p/${projectRef}`);
  revalidatePath("/");
  return { ok: true };
}
