/**
 * What a bucket's listing means.
 *
 * Supabase Storage has **no directories**. Measured 2026-09-25: uploading `notes/deep/second.txt`
 * makes `notes` appear in a listing of the root, and nothing created it. `POST /object/list`
 * answers a **bare array**, not an envelope, and a folder is an entry whose every field is null
 * except its name:
 *
 * ```json
 * [{"name": "hello.txt", "id": "b995a0c5-…", "metadata": {"size": 20, …}},
 *  {"name": "notes",     "id": null,         "metadata": null}]
 * ```
 */
export type StorageObject = {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  metadata: { size?: number; mimetype?: string } | null;
};

/** The only thing separating a folder from a file in a listing. */
export const isFolder = (entry: StorageObject) => entry.id === null;

/** Folders first, then by name — the order a file browser is read in. */
export function sortEntries(entries: StorageObject[]): StorageObject[] {
  return [...entries].sort((a, b) => {
    const byKind = Number(isFolder(b)) - Number(isFolder(a));
    return byKind !== 0 ? byKind : a.name.localeCompare(b.name);
  });
}

/**
 * A prefix and a name joined into the key the API uses.
 *
 * The root's prefix is empty, and joining onto it must not produce a leading slash: `"/hello.txt"`
 * and `"hello.txt"` are different objects.
 */
export const joinPath = (prefix: string, name: string) =>
  prefix ? `${prefix.replace(/\/+$/, "")}/${name}` : name;

/** The trail back to the root, each step carrying the prefix that opens it. */
export function breadcrumbs(prefix: string): { name: string; prefix: string }[] {
  const parts = prefix.split("/").filter(Boolean);
  return parts.map((name, i) => ({ name, prefix: parts.slice(0, i + 1).join("/") }));
}

/** What one listing returns at most, so the browser can tell a full page from a complete folder. */
export const PAGE_SIZE = 200;

const IMAGE = /^image\//;

/** Whether the details panel can show the thing rather than describe it. */
export const isPreviewable = (entry: StorageObject) =>
  !isFolder(entry) && IMAGE.test(entry.metadata?.mimetype ?? "");

/**
 * A path a browser may ask this app to sign.
 *
 * Rejects what would change which object is addressed rather than which one is meant: an absolute
 * path, a traversal segment, or an empty one. The API's own path is escaped before it is sent, so
 * this is about the key, not about the URL.
 */
export function objectPathProblem(path: unknown): string | null {
  if (typeof path !== "string" || path.trim() === "") return "That is not a file.";
  if (path.length > 1024) return "That path is too long.";
  if (path.startsWith("/")) return "That is not a file.";
  if (path.split("/").some((part) => part === "." || part === "..")) return "That is not a file.";
  return null;
}
