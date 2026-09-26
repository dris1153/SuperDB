"use server";

import { bucketNameProblem } from "./buckets";
import { resolveProject } from "./inventory";
import {
  createStorageBucket,
  deleteObjects,
  deleteStorageBucket,
  listAllObjects,
  updateStorageBucket,
  StorageError,
} from "./storage-api";
import { recordWrite } from "./write-audit";

export type BucketResult = { ok: true } | { ok: false; reason: string };

export type BucketSettings = {
  isPublic: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
};

/**
 * A bound on the delete-and-relist loop below.
 *
 * Reached only if the API keeps reporting objects it will not remove, which the loop's own
 * no-progress check should catch first. The bucket delete that follows refuses while anything is
 * left, so overrunning fails loudly rather than half-emptying a bucket in silence.
 */
const MAX_PAGES = 200;

/** Storage's failures are worth passing through: they name the rule that was broken. */
const failed = (e: unknown): string =>
  e instanceof StorageError ? e.message : "Could not reach this project's storage.";

/**
 * The settings a bucket can carry, checked rather than trusted.
 *
 * Every export here is an endpoint a signed-in browser can call with any payload at all, and the
 * types are erased at runtime. Without this, `input.allowedMimeTypes` could be a number and the
 * failure would surface as a storage error about a request this app built wrong.
 */
function settingsProblem(input: unknown): { problem: string } | { settings: BucketSettings } {
  if (typeof input !== "object" || input === null) return { problem: "Nothing to save." };

  const { isPublic, fileSizeLimit, allowedMimeTypes } = input as Record<string, unknown>;

  if (typeof isPublic !== "boolean") return { problem: "Public must be yes or no." };

  if (fileSizeLimit !== null && (typeof fileSizeLimit !== "number" || !Number.isInteger(fileSizeLimit) || fileSizeLimit < 1)) {
    return { problem: "A size limit must be a whole number of bytes, or none at all." };
  }

  if (
    allowedMimeTypes !== null &&
    (!Array.isArray(allowedMimeTypes) || allowedMimeTypes.some((t) => typeof t !== "string" || t.trim() === ""))
  ) {
    return { problem: "MIME types must be a list of names, or none at all." };
  }

  return {
    settings: {
      isPublic,
      fileSizeLimit: fileSizeLimit as number | null,
      allowedMimeTypes: (allowedMimeTypes as string[] | null)?.map((t) => t.trim()) ?? null,
    },
  };
}

/** Ownership before anything else, so a caller with no claim on the project learns nothing else. */
const owned = async (projectRef: string) => (await resolveProject(projectRef)) !== null;

export async function createBucket(
  projectRef: string,
  name: string,
  input: BucketSettings,
): Promise<BucketResult> {
  if (!(await owned(projectRef))) return { ok: false, reason: "Project not found." };

  const problem = bucketNameProblem(name);
  if (problem) return { ok: false, reason: problem };

  const checked = settingsProblem(input);
  if ("problem" in checked) return { ok: false, reason: checked.problem };

  const id = (name as string).trim();

  try {
    await createStorageBucket(projectRef, {
      id,
      name: id,
      public: checked.settings.isPublic,
      file_size_limit: checked.settings.fileSizeLimit,
      allowed_mime_types: checked.settings.allowedMimeTypes,
    });
    await recordWrite({ ref: projectRef, what: `storage bucket ${id}`, outcome: "created" });
    return { ok: true };
  } catch (e) {
    const reason = failed(e);
    await recordWrite({
      ref: projectRef,
      what: `storage bucket ${id}`,
      outcome: `create failed: ${reason.slice(0, 200)}`,
    });
    return { ok: false, reason };
  }
}

/**
 * The name is fixed at creation; only these three can change.
 *
 * Addressed by `id`, not by display name. They are equal for buckets this app creates, and a bucket
 * created elsewhere can have them differ — in which case the name would address nothing.
 */
export async function updateBucket(
  projectRef: string,
  id: string,
  input: BucketSettings,
): Promise<BucketResult> {
  if (!(await owned(projectRef))) return { ok: false, reason: "Project not found." };

  const problem = bucketNameProblem(id);
  if (problem) return { ok: false, reason: "That is not a bucket." };

  const checked = settingsProblem(input);
  if ("problem" in checked) return { ok: false, reason: checked.problem };

  try {
    await updateStorageBucket(projectRef, id, {
      public: checked.settings.isPublic,
      file_size_limit: checked.settings.fileSizeLimit,
      allowed_mime_types: checked.settings.allowedMimeTypes,
    });
    await recordWrite({ ref: projectRef, what: `storage bucket ${id}`, outcome: "updated" });
    return { ok: true };
  } catch (e) {
    const reason = failed(e);
    await recordWrite({
      ref: projectRef,
      what: `storage bucket ${id}`,
      outcome: `update failed: ${reason.slice(0, 200)}`,
    });
    return { ok: false, reason };
  }
}

/**
 * Deleting a bucket, and its objects first when asked.
 *
 * `POST /bucket/{id}/empty` is **asynchronous** — measured, it answers "queued. Completion may take
 * up to an hour" — so emptying and then deleting fails with `ResourceNotEmpty`. Deleting the objects
 * outright works at once, which is what this does.
 *
 * **The count is what came back, not what was asked for.** `DELETE /object/{bucket}` returns the
 * rows it removed: measured with three prefixes where one did not exist, it answered two. So a page
 * that removes nothing means no progress is being made, and the loop stops rather than re-listing
 * the same objects until it hits the page bound.
 */
export async function deleteBucket(
  projectRef: string,
  id: string,
  withContents: boolean,
): Promise<BucketResult> {
  if (!(await owned(projectRef))) return { ok: false, reason: "Project not found." };
  if (bucketNameProblem(id)) return { ok: false, reason: "That is not a bucket." };
  if (typeof withContents !== "boolean") return { ok: false, reason: "Nothing to do." };

  let removed = 0;
  let gaveUp = false;

  try {
    if (withContents) {
      for (let page = 0; page < MAX_PAGES; page++) {
        // list-v2 is flat, so one page reaches objects at every depth — but only one page of them,
        // and it carries no cursor to resume from. Delete, then ask again.
        const listed = await listAllObjects(projectRef, id);
        const names = listed.objects.map((o) => o.name);
        if (names.length === 0) break;

        const gone = await deleteObjects(projectRef, id, names);
        if (gone.length === 0) {
          // The API reports objects it will not remove. Re-listing would find the same ones.
          gaveUp = true;
          break;
        }

        removed += gone.length;
        if (!listed.hasNext && gone.length === names.length) break;
        if (page === MAX_PAGES - 1) gaveUp = true;
      }
    }

    if (gaveUp) {
      await recordWrite({
        ref: projectRef,
        what: `storage bucket ${id}`,
        outcome: `delete abandoned after removing ${removed} objects`,
      });
      return {
        ok: false,
        reason: `Removed ${removed} objects, but the bucket still has more than this page can clear. Empty it from the Supabase dashboard.`,
      };
    }

    await deleteStorageBucket(projectRef, id);
    await recordWrite({
      ref: projectRef,
      what: `storage bucket ${id}`,
      outcome: `deleted with ${removed} objects`,
    });
    return { ok: true };
  } catch (e) {
    const reason = failed(e);
    await recordWrite({
      ref: projectRef,
      what: `storage bucket ${id}`,
      outcome: `delete failed after removing ${removed} objects: ${reason.slice(0, 200)}`,
    });
    return { ok: false, reason };
  }
}
