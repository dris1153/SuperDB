import assert from "node:assert/strict";
import test from "node:test";
import { activeTabOf, closeTab, dirtyTabs, firstState, parseTabs } from "./sql-tabs.ts";

const state = (ids: string[], activeId = ids[0]) => ({
  tabs: ids.map((id) => ({ id, queryId: null })),
  activeId,
});

test("a store that is not JSON, or not an object, starts fresh", () => {
  for (const raw of ["", "{", "null", '"text"', "[]", "[1,2]"]) {
    assert.deepEqual(parseTabs(raw, "t0"), firstState("t0"), `for ${JSON.stringify(raw)}`);
  }
});

test("tabs that are not tabs are dropped, and an empty result starts fresh", () => {
  const raw = JSON.stringify({ tabs: [1, null, { id: 5 }, { id: "a", queryId: 7 }], activeId: "a" });
  assert.deepEqual(parseTabs(raw, "t0"), firstState("t0"));
});

test("a duplicate id is dropped rather than given a second tab", () => {
  // Two tabs with one id share a buffer key and a React key, and closing either takes both.
  const raw = JSON.stringify({
    tabs: [{ id: "a", queryId: null }, { id: "a", queryId: "q1" }, { id: "b", queryId: null }],
    activeId: "b",
  });
  const parsed = parseTabs(raw, "t0");
  assert.deepEqual(parsed.tabs.map((t) => t.id), ["a", "b"]);
});

test("an empty id is dropped: it would name the bare buffer key", () => {
  const raw = JSON.stringify({ tabs: [{ id: "", queryId: null }, { id: "b", queryId: null }] });
  assert.deepEqual(parseTabs(raw, "t0").tabs.map((t) => t.id), ["b"]);
});

test("an activeId naming no tab falls back to the first", () => {
  const raw = JSON.stringify({ tabs: [{ id: "a", queryId: null }], activeId: "gone" });
  assert.equal(parseTabs(raw, "t0").activeId, "a");
  assert.equal(activeTabOf({ tabs: [{ id: "a", queryId: null }], activeId: "gone" }).id, "a");
});

test("a saved queryId survives parsing", () => {
  const raw = JSON.stringify({ tabs: [{ id: "a", queryId: "q1" }], activeId: "a" });
  assert.equal(parseTabs(raw, "t0").tabs[0].queryId, "q1");
});

test("closing the active tab moves right, then left", () => {
  assert.equal(closeTab(state(["a", "b", "c"], "b"), "b", "fresh").activeId, "c");
  assert.equal(closeTab(state(["a", "b", "c"], "c"), "c", "fresh").activeId, "b");
});

test("closing an inactive tab leaves the active one alone", () => {
  const next = closeTab(state(["a", "b", "c"], "b"), "a", "fresh");
  assert.equal(next.activeId, "b");
  assert.deepEqual(next.tabs.map((t) => t.id), ["b", "c"]);
});

test("closing the last tab leaves one fresh empty tab", () => {
  assert.deepEqual(closeTab(state(["a"]), "a", "fresh"), firstState("fresh"));
});

test("closing a tab that is already gone changes nothing", () => {
  // The dialog can hold a tab the store has since dropped; the arithmetic must not index at -1.
  const before = state(["a", "b"], "a");
  assert.equal(closeTab(before, "zzz", "fresh"), before);
});

const buffers = (map: Record<string, string>) => (id: string) => map[id] ?? "";
const saved = (map: Record<string, string>) => (id: string) => map[id];

test("a tab matching its saved query is not dirty", () => {
  const tabs = [{ id: "a", queryId: "q1" }];
  const { ids } = dirtyTabs(tabs, buffers({ a: "select 1" }), saved({ q1: "select 1" }));
  assert.equal(ids.size, 0);
});

test("an edited buffer is dirty, whitespace included", () => {
  const tabs = [{ id: "a", queryId: "q1" }];
  const { ids } = dirtyTabs(tabs, buffers({ a: "select 1 " }), saved({ q1: "select 1" }));
  assert.deepEqual([...ids], ["a"]);
});

test("an unsaved tab is dirty only once it has text", () => {
  const tabs = [{ id: "a", queryId: null }];
  assert.equal(dirtyTabs(tabs, buffers({}), saved({})).ids.size, 0);
  assert.deepEqual([...dirtyTabs(tabs, buffers({ a: "x" }), saved({})).ids], ["a"]);
});

test("a tab whose query is gone reads as unsaved rather than as clean", () => {
  // Deleted in the sidebar, or past the list's limit: either way nothing here can confirm it saved.
  const tabs = [{ id: "a", queryId: "gone" }];
  assert.deepEqual([...dirtyTabs(tabs, buffers({ a: "select 1" }), saved({})).ids], ["a"]);
});

test("a tab whose query has not been read yet is neither dirty nor gone", () => {
  // The tabs come back from sessionStorage before the list comes back from the server. Reading that
  // window as "deleted" marked every restored tab unsaved, and offered to save a duplicate of it.
  const tabs = [{ id: "a", queryId: "q1" }];
  const loading = dirtyTabs(tabs, buffers({ a: "select 1" }), saved({}), false);
  assert.equal(loading.ids.size, 0);

  // And once the list is in, a query that really is gone reads as unsaved again.
  const listed = dirtyTabs(tabs, buffers({ a: "select 1" }), saved({}), true);
  assert.deepEqual([...listed.ids], ["a"]);
  assert.notEqual(loading.signature, listed.signature);
});

test("the signature changes only when the answer does", () => {
  const tabs = [{ id: "a", queryId: "q1" }, { id: "b", queryId: null }];
  const one = dirtyTabs(tabs, buffers({ a: "select 1" }), saved({ q1: "select 1" }));
  const same = dirtyTabs(tabs, buffers({ a: "select 1" }), saved({ q1: "select 1" }));
  assert.equal(one.signature, same.signature);

  // Same length, one character different: a signature built from lengths would miss this.
  const edited = dirtyTabs(tabs, buffers({ a: "select 2" }), saved({ q1: "select 1" }));
  assert.notEqual(one.signature, edited.signature);
});

test("the signature distinguishes tabs that merely swapped places", () => {
  const bufferOf = buffers({ a: "x", b: "" });
  const savedOf = saved({});
  const one = dirtyTabs([{ id: "a", queryId: null }, { id: "b", queryId: null }], bufferOf, savedOf);
  const swapped = dirtyTabs([{ id: "b", queryId: null }, { id: "a", queryId: null }], bufferOf, savedOf);
  assert.notEqual(one.signature, swapped.signature);
});
