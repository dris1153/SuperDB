import assert from "node:assert/strict";
import test from "node:test";
import {
  breadcrumbs,
  isFolder,
  isPreviewable,
  joinPath,
  objectPathProblem,
  sortEntries,
  type StorageObject,
} from "./storage-objects.ts";

const file = (name: string, over: Partial<StorageObject> = {}): StorageObject => ({
  name,
  id: "b995a0c5-6268-44c8-8b28-be0a4881e04d",
  updated_at: "2026-09-25T09:44:04.726Z",
  created_at: "2026-09-25T09:44:04.726Z",
  metadata: { size: 20, mimetype: "text/plain" },
  ...over,
});

const folder = (name: string): StorageObject => ({
  name,
  id: null,
  updated_at: null,
  created_at: null,
  metadata: null,
});

test("a folder is an entry with no id, and nothing else says so", () => {
  // Measured: a folder entry has every field null but its name. An empty metadata object or a
  // zero-byte file would both be files, so size cannot be the test.
  assert.equal(isFolder(folder("notes")), true);
  assert.equal(isFolder(file("hello.txt")), false);
  assert.equal(isFolder(file("empty.txt", { metadata: { size: 0 } })), false);
});

test("folders come first, then names", () => {
  const sorted = sortEntries([file("b.txt"), folder("zeta"), file("a.txt"), folder("alpha")]);
  assert.deepEqual(sorted.map((e) => e.name), ["alpha", "zeta", "a.txt", "b.txt"]);
});

test("joining onto the root does not invent a leading slash", () => {
  // "/hello.txt" and "hello.txt" are different objects.
  assert.equal(joinPath("", "hello.txt"), "hello.txt");
  assert.equal(joinPath("notes", "second.txt"), "notes/second.txt");
  assert.equal(joinPath("notes/", "second.txt"), "notes/second.txt");
  assert.equal(joinPath("notes/deep", "third.txt"), "notes/deep/third.txt");
});

test("breadcrumbs carry the prefix that opens each step", () => {
  assert.deepEqual(breadcrumbs(""), []);
  assert.deepEqual(breadcrumbs("notes/deep"), [
    { name: "notes", prefix: "notes" },
    { name: "deep", prefix: "notes/deep" },
  ]);
});

test("only images preview", () => {
  assert.equal(isPreviewable(file("a.png", { metadata: { mimetype: "image/png" } })), true);
  assert.equal(isPreviewable(file("a.pdf", { metadata: { mimetype: "application/pdf" } })), false);
  assert.equal(isPreviewable(file("a.bin", { metadata: null })), false);
  assert.equal(isPreviewable(folder("images")), false);
});

test("a path that would address a different object is refused", () => {
  assert.equal(objectPathProblem("notes/deep/second.txt"), null);
  assert.equal(objectPathProblem("file with spaces.txt"), null);
  assert.match(objectPathProblem("/etc/passwd") ?? "", /not a file/);
  assert.match(objectPathProblem("../other-bucket/x") ?? "", /not a file/);
  assert.match(objectPathProblem("notes/../../x") ?? "", /not a file/);
  assert.match(objectPathProblem("") ?? "", /not a file/);
  assert.match(objectPathProblem(undefined) ?? "", /not a file/);
});
