"use server";

import { revalidatePath } from "next/cache";
import { resolveProject } from "./inventory";
import { restoreProject } from "./mgmt-api";
import { attempt } from "./safe";

export type ResumeResult = { ok: true } | { ok: false; reason: string };

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
