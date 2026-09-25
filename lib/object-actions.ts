"use server";

import { bucketNameProblem } from "./buckets";
import { resolveProject } from "./inventory";
import {
  deleteObjects as removeObjects,
  getStorageBucket,
  moveObject as move,
  publicObjectUrl,
  signDownload,
  signUpload,
  storageOrigin,
  StorageError,
} from "./storage-api";
import { objectPathProblem } from "./storage-objects";
import { recordWrite } from "./write-audit";

export type ObjectResult = { ok: true } | { ok: false; reason: string };
export type UrlResult = { ok: true; url: string } | { ok: false; reason: string };

/**
 * The longest a read link this app hands out may live.
 *
 * A signed URL is a bearer token: whoever holds it reads that object, with no session and no
 * account. `expiresIn` arrives from the browser — every export here is an endpoint — so without a
 * ceiling a caller could mint a ten-year link that outlives the session, the OAuth grant and the
 * connection it was made with. Revoking any of those does nothing to a URL already issued.
 */
const MAX_URL_SECONDS = 3600;

/** How many objects one delete may name. The API takes an array; this is not a reason to send it one of any size. */
const MAX_DELETE = 500;

const failed = (e: unknown): string =>
  e instanceof StorageError ? e.message : "Could not reach this project's storage.";

/** Ownership first, then the arguments — a caller with no claim learns nothing from the difference. */
async function gate(projectRef: string, bucket: string, path: string): Promise<string | null> {
  if (!(await resolveProject(projectRef))) return "Project not found.";
  if (bucketNameProblem(bucket)) return "That is not a bucket.";
  return objectPathProblem(path);
}

/**
 * A URL the browser uploads to directly.
 *
 * The signature is minted per file at the moment of upload rather than in advance: it is a
 * capability — two hours, one path, upload scope — and it is handed to the browser.
 *
 * Audited here, because the upload itself never touches this server and there would otherwise be no
 * record that a file was added.
 */
export async function signUploadUrl(
  projectRef: string,
  bucket: string,
  path: string,
): Promise<UrlResult> {
  const problem = await gate(projectRef, bucket, path);
  if (problem) return { ok: false, reason: problem };

  try {
    const { url } = await signUpload(projectRef, bucket, path);
    return { ok: true, url: `${storageOrigin(projectRef)}${url}` };
  } catch (e) {
    return { ok: false, reason: failed(e) };
  }
}

/**
 * The audit line for an upload, written once for the batch.
 *
 * Signing is not a write — the object does not exist until the browser's `PUT` lands, and that never
 * comes back here. Auditing each signature also meant `recordWrite` dropping this project's part
 * cache once per file, and the entry that protects is `metrics`, whose upstream limit is a measured
 * ten requests a minute. Uploading eleven files would have flushed it eleven times and sent anyone
 * with the overview open into 429s.
 */
export async function recordUploads(
  projectRef: string,
  bucket: string,
  uploaded: number,
  failures: number,
): Promise<void> {
  if (!(await resolveProject(projectRef))) return;
  if (bucketNameProblem(bucket)) return;
  if (!Number.isInteger(uploaded) || !Number.isInteger(failures)) return;
  if (uploaded < 1 && failures < 1) return;

  await recordWrite({
    ref: projectRef,
    what: `storage objects in ${bucket}`,
    outcome: `uploaded ${uploaded}${failures ? `, ${failures} refused` : ""}`,
  });
}

/**
 * A URL that reads one object.
 *
 * A public bucket needs no signature, so it gets the public URL — shareable, and what the original
 * hands over. A private one gets a signed URL that expires; reading is not audited, only writing is.
 */
export async function objectUrl(
  projectRef: string,
  bucket: string,
  path: string,
  expiresIn = MAX_URL_SECONDS,
): Promise<UrlResult> {
  const problem = await gate(projectRef, bucket, path);
  if (problem) return { ok: false, reason: problem };

  // Clamped, not defaulted: the default is a TypeScript default and the caller is a browser.
  const seconds =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? Math.min(Math.floor(expiresIn), MAX_URL_SECONDS)
      : MAX_URL_SECONDS;

  try {
    // Whether the bucket is public is read here rather than taken from the caller. It decides
    // whether this hands back a URL that never expires, which is not a decision to accept from a
    // client-side cache that may be a minute stale.
    const here = await getStorageBucket(projectRef, bucket);
    if (here.public) return { ok: true, url: publicObjectUrl(projectRef, bucket, path) };

    const { signedURL } = await signDownload(projectRef, bucket, path, seconds);
    return { ok: true, url: `${storageOrigin(projectRef)}${signedURL}` };
  } catch (e) {
    return { ok: false, reason: failed(e) };
  }
}

/** Deleting. The API answers with the rows it removed, so the count is real. */
export async function deleteObjectsAt(
  projectRef: string,
  bucket: string,
  paths: string[],
): Promise<{ ok: true; removed: number } | { ok: false; reason: string }> {
  if (!(await resolveProject(projectRef))) return { ok: false, reason: "Project not found." };
  if (bucketNameProblem(bucket)) return { ok: false, reason: "That is not a bucket." };
  if (!Array.isArray(paths) || paths.length === 0) return { ok: false, reason: "Nothing to delete." };
  if (paths.length > MAX_DELETE) return { ok: false, reason: `Too many files at once — ${MAX_DELETE} is the limit.` };

  for (const path of paths) {
    const problem = objectPathProblem(path);
    if (problem) return { ok: false, reason: problem };
  }

  try {
    const gone = await removeObjects(projectRef, bucket, paths);
    await recordWrite({
      ref: projectRef,
      what: `storage objects in ${bucket}`,
      outcome: `deleted ${gone.length} of ${paths.length}`,
    });
    return { ok: true, removed: gone.length };
  } catch (e) {
    const reason = failed(e);
    await recordWrite({
      ref: projectRef,
      what: `storage objects in ${bucket}`,
      outcome: `delete failed: ${reason.slice(0, 200)}`,
    });
    return { ok: false, reason };
  }
}

/** Renaming is moving: Storage has no rename, and a path is the whole identity of an object. */
export async function renameObject(
  projectRef: string,
  bucket: string,
  from: string,
  to: string,
): Promise<ObjectResult> {
  const first = await gate(projectRef, bucket, from);
  if (first) return { ok: false, reason: first };

  const second = objectPathProblem(to);
  if (second) return { ok: false, reason: second };

  try {
    await move(projectRef, bucket, from, to);
    await recordWrite({ ref: projectRef, what: `storage object in ${bucket}`, outcome: `moved ${from} to ${to}` });
    return { ok: true };
  } catch (e) {
    const reason = failed(e);
    await recordWrite({
      ref: projectRef,
      what: `storage object in ${bucket}`,
      outcome: `move failed: ${reason.slice(0, 200)}`,
    });
    return { ok: false, reason };
  }
}
