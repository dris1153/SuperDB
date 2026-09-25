import "server-only";
import { projectKey } from "./project-key";
import type { StorageObject } from "./storage-objects";

/**
 * The project's own Storage API — the half of Storage the Management API cannot reach.
 *
 * Measured 2026-09-25: the Management API has three storage paths and none of them touches a
 * bucket's contents or creates one. Everything here runs against
 * `https://{ref}.supabase.co/storage/v1` with a key from `lib/project-key.ts`.
 */
const origin = (ref: string) => `https://${ref}.supabase.co/storage/v1`;

/**
 * A failure from the Storage API, with the status it meant rather than the one it sent.
 *
 * This API answers **HTTP 400** and puts the real status in the body:
 * `{"statusCode":"409","error":"ResourceNotEmpty","message":"..."}`. Reading the HTTP status alone
 * would turn "this bucket still has files in it" into "bad request", losing the one thing the
 * caller could act on.
 */
export class StorageError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(ref: string, path: string, init: RequestInit = {}): Promise<T> {
  const lookup = await projectKey(ref);
  if (!lookup.ok) throw new StorageError(403, "NoProjectKey", lookup.reason);

  const res = await fetch(origin(ref) + path, {
    ...init,
    headers: {
      authorization: `Bearer ${lookup.key}`,
      apikey: lookup.key,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();

  if (!res.ok) {
    try {
      const body = JSON.parse(text) as { statusCode?: string; error?: string; message?: string };
      throw new StorageError(
        Number(body.statusCode) || res.status,
        body.error ?? "Unknown",
        body.message ?? text.slice(0, 300),
      );
    } catch (e) {
      if (e instanceof StorageError) throw e;
      // Not the body: a proxy or an edge error answers with HTML, and pasting three hundred
      // characters of it into the page says less than the status does.
      throw new StorageError(res.status, "Unknown", `This project's storage answered ${res.status}.`);
    }
  }

  // Some endpoints answer 200 with an empty body; JSON.parse("") throws.
  return (text ? JSON.parse(text) : undefined) as T;
}

export type StorageBucket = {
  id: string;
  name: string;
  public: boolean;
  /** Only present in the list — reading one bucket does not include it. Measured. */
  type?: "STANDARD" | "ANALYTICS" | "VECTOR";
  file_size_limit: number | null;
  allowed_mime_types: string[] | null;
  created_at: string;
  updated_at: string;
};

export const listStorageBuckets = (ref: string) => call<StorageBucket[]>(ref, "/bucket");

/** Answers `{name}` alone, not the bucket — callers refetch rather than inventing a row. */
export const createStorageBucket = (
  ref: string,
  body: {
    id: string;
    name: string;
    public: boolean;
    file_size_limit?: number | null;
    allowed_mime_types?: string[] | null;
  },
) => call<{ name: string }>(ref, "/bucket", { method: "POST", body: JSON.stringify(body) });

export const updateStorageBucket = (
  ref: string,
  id: string,
  body: { public?: boolean; file_size_limit?: number | null; allowed_mime_types?: string[] | null },
) => call<{ message: string }>(ref, `/bucket/${encodeURIComponent(id)}`, {
  method: "PUT",
  body: JSON.stringify(body),
});

/** One bucket. Carries everything except `type`, which only the list includes. Measured. */
export const getStorageBucket = (ref: string, id: string) =>
  call<StorageBucket>(ref, `/bucket/${encodeURIComponent(id)}`);

/** Refused with `ResourceNotEmpty` while the bucket still holds objects. */
export const deleteStorageBucket = (ref: string, id: string) =>
  call<{ message: string }>(ref, `/bucket/${encodeURIComponent(id)}`, { method: "DELETE" });

/**
 * One level of a bucket, the way a file browser reads it.
 *
 * `list` rather than `list-v2`: v1 walks a level at a time and synthesises folder entries, which is
 * what a tree needs. It answers a **bare array**, not an envelope — measured 2026-09-25.
 *
 * `limit` bounds a directory listing. The caller decides what to do when it comes back full — the
 * file browser says the folder is truncated rather than pretending it is complete.
 */
export const listObjects = (
  ref: string,
  bucket: string,
  options: { prefix?: string; limit?: number; offset?: number; search?: string } = {},
) =>
  call<StorageObject[]>(ref, `/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    body: JSON.stringify({
      prefix: options.prefix ?? "",
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      sortBy: { column: "name", order: "asc" },
      ...(options.search ? { search: options.search } : {}),
    }),
  });

/**
 * A URL the browser can `PUT` to, with no credential on it.
 *
 * Measured 2026-09-25: the returned URL accepts an upload with **no `authorization` header at all**,
 * and its token lasts two hours. So the server signs and the browser uploads — `service_role` never
 * leaves this process, and the upload does not pass through a route handler's body limit.
 *
 * The URL comes back relative; the caller prepends the origin.
 */
export const signUpload = (ref: string, bucket: string, path: string) =>
  call<{ url: string; token: string }>(
    ref,
    `/object/upload/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`,
    { method: "POST", body: JSON.stringify({}) },
  );

/** Also relative, also token-bearing, and `expiresIn` is seconds. */
export const signDownload = (ref: string, bucket: string, path: string, expiresIn: number) =>
  call<{ signedURL: string }>(
    ref,
    `/object/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`,
    { method: "POST", body: JSON.stringify({ expiresIn }) },
  );

export const moveObject = (ref: string, bucket: string, from: string, to: string) =>
  call<{ message: string }>(ref, "/object/move", {
    method: "POST",
    body: JSON.stringify({ bucketId: bucket, sourceKey: from, destinationKey: to }),
  });

/** The public origin, for a bucket that needs no signature at all. */
export const publicObjectUrl = (ref: string, bucket: string, path: string) =>
  `${origin(ref)}/object/public/${encodeURIComponent(bucket)}/${encodePath(path)}`;

/** The origin a signed URL is relative to. */
export const storageOrigin = (ref: string) => origin(ref);

/**
 * Each segment escaped, the separators left alone.
 *
 * `encodeURIComponent` on the whole path would turn every `/` into `%2F` and address one object
 * whose name contains slashes rather than one inside a folder.
 *
 * **It refuses traversal itself rather than trusting the caller to have checked.**
 * `encodeURIComponent` does not escape a dot, so `..` survives verbatim into `fetch`, and the URL
 * parser resolves it before the request leaves — aiming a `service_role`-bearing POST at any path
 * under the project's Storage API. `objectPathProblem` catches it first and produces a readable
 * message; this is the check that holds when a future caller forgets to call that one.
 */
export function encodePath(path: string) {
  const segments = path.split("/");
  if (segments.some((part) => part === "." || part === "..")) {
    throw new StorageError(400, "InvalidPath", "That is not a file.");
  }

  return segments.map(encodeURIComponent).join("/");
}

/**
 * Every object in a bucket, however deeply nested.
 *
 * `list-v2` rather than `list`: v1 walks one level at a time and returns folders as entries, while
 * v2 is flat and names each object by its whole path — which is what deleting a bucket's contents
 * needs. Measured 2026-09-25.
 *
 * `/config/storage` reports `capabilities.list_v2`, true on every project measured. A project
 * without it would fail here rather than silently listing nothing, and the caller shows what came
 * back.
 */
export const listAllObjects = (ref: string, bucket: string, limit = 1000) =>
  call<{ hasNext: boolean; objects: { name: string }[] }>(
    ref,
    `/object/list-v2/${encodeURIComponent(bucket)}`,
    { method: "POST", body: JSON.stringify({ limit }) },
  );

export const deleteObjects = (ref: string, bucket: string, prefixes: string[]) =>
  call<unknown[]>(ref, `/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes }),
  });
