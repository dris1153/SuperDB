import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL,
  bySavedOrder,
  dedupeRefs,
  isReorderable,
  isValidProjectOrder,
  PROJECT_SORTS,
  sortProjects,
} from "./project-sort.ts";
import type { Project } from "./mgmt-api.ts";

type Row = { name: string; status: Project["status"]; region: string; created_at: string };

const row = (name: string, over: Partial<Row> = {}): Row => ({
  name,
  status: "ACTIVE_HEALTHY",
  region: "us-east-1",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const names = (rows: Row[]) => rows.map((r) => r.name);

test("my order is returned untouched, not copied", () => {
  const rows = [row("c"), row("a"), row("b")];
  const result = sortProjects(rows, "manual");
  assert.equal(result, rows, "same reference — it is already the answer");
  assert.deepEqual(names(result), ["c", "a", "b"]);
});

test("sorting never mutates the connection order it was given", () => {
  const rows = [row("c"), row("a"), row("b")];
  sortProjects(rows, "name");
  assert.deepEqual(names(rows), ["c", "a", "b"]);
});

test("sorts by name", () => {
  const rows = [row("zeta"), row("alpha"), row("Mid")];
  assert.deepEqual(names(sortProjects(rows, "name")), ["alpha", "Mid", "zeta"]);
});

test("sorts by region on the raw code, the way the card prints it", () => {
  const rows = [
    row("us", { region: "us-east-1" }),
    row("ap", { region: "ap-southeast-2" }),
    row("eu", { region: "eu-west-1" }),
  ];
  assert.deepEqual(names(sortProjects(rows, "region")), ["ap", "eu", "us"]);
});

test("newest first", () => {
  const rows = [
    row("aug", { created_at: "2026-08-25T00:00:00Z" }),
    row("dec", { created_at: "2026-12-01T00:00:00Z" }),
    row("sep", { created_at: "2026-09-05T00:00:00Z" }),
  ];
  assert.deepEqual(names(sortProjects(rows, "newest")), ["dec", "sep", "aug"]);
});

test("status puts what needs attention first and healthy last", () => {
  const rows = [
    row("healthy", { status: "ACTIVE_HEALTHY" }),
    row("paused", { status: "INACTIVE" }),
    row("broken", { status: "ACTIVE_UNHEALTHY" }),
    row("moving", { status: "RESTORING" }),
  ];
  assert.deepEqual(names(sortProjects(rows, "status")), ["broken", "moving", "paused", "healthy"]);
});

test("status does not sort alphabetically, which would put healthy above unhealthy", () => {
  const rows = [row("healthy", { status: "ACTIVE_HEALTHY" }), row("bad", { status: "ACTIVE_UNHEALTHY" })];
  assert.deepEqual(names(sortProjects(rows, "status")), ["bad", "healthy"]);
});

test("every failure state outranks every transitional one", () => {
  const failures: Project["status"][] = [
    "ACTIVE_UNHEALTHY",
    "INIT_FAILED",
    "RESTORE_FAILED",
    "PAUSE_FAILED",
  ];
  const moving: Project["status"][] = ["COMING_UP", "GOING_DOWN", "PAUSING", "RESTORING"];

  for (const bad of failures) {
    for (const busy of moving) {
      const sorted = sortProjects([row("busy", { status: busy }), row("bad", { status: bad })], "status");
      assert.deepEqual(names(sorted), ["bad", "busy"], `${bad} should outrank ${busy}`);
    }
  }
});

test("a status this app has not learned about sorts last rather than throwing", () => {
  const rows = [
    row("future", { status: "SOMETHING_NEW" as Project["status"] }),
    row("healthy", { status: "ACTIVE_HEALTHY" }),
  ];
  assert.deepEqual(names(sortProjects(rows, "status")), ["healthy", "future"]);
});

test("equal keys keep the order they arrived in, so connection order survives", () => {
  const rows = [row("third"), row("first"), row("second")];
  assert.deepEqual(names(sortProjects(rows, "status")), ["third", "first", "second"]);
});

test("every option has a label and the default is connection order", () => {
  assert.equal(PROJECT_SORTS[0].value, "manual");
  assert.equal(PROJECT_SORTS.length, 5);
  for (const option of PROJECT_SORTS) assert.ok(option.label.length > 0, option.value);
});

const REF_A = "aaaaaaaaaaaaaaaaaaaa";
const REF_B = "bbbbbbbbbbbbbbbbbbbb";
const REF_C = "cccccccccccccccccccc";
const refsOf = (list: { ref: string }[]) => list.map((r) => r.ref);
const tiles = (...refs: string[]) => refs.map((ref) => ({ ref }));

test("saved order follows the stored positions", () => {
  const order = new Map([
    [REF_A, 2],
    [REF_B, 1],
  ]);
  assert.deepEqual(refsOf(tiles(REF_A, REF_B).sort(bySavedOrder(order))), [REF_B, REF_A]);
});

test("a project with no saved position sorts last, never first", () => {
  const order = new Map([[REF_B, 1]]);
  // Unplaced first in the input, and unplaced second: it ends up behind the placed one either way.
  assert.deepEqual(refsOf(tiles(REF_A, REF_B).sort(bySavedOrder(order))), [REF_B, REF_A]);
  assert.deepEqual(refsOf(tiles(REF_B, REF_A).sort(bySavedOrder(order))), [REF_B, REF_A]);
});

test("unplaced projects keep the order they arrived in, so connection grouping survives", () => {
  const before = tiles(REF_C, REF_A, REF_B);
  assert.deepEqual(refsOf([...before].sort(bySavedOrder(new Map()))), refsOf(before));
});

test("the unplaced sentinel cannot collide with a real position or lose precision", () => {
  // Positions are 1-based from `with ordinality`, so the gap to the sentinel is always exact.
  const compare = bySavedOrder(new Map([[REF_A, 1]]));
  const diff = compare({ ref: REF_B }, { ref: REF_A });
  assert.equal(diff, Number.MAX_SAFE_INTEGER - 1);
  assert.ok(Number.isSafeInteger(diff), "difference stays exactly representable");
  assert.ok(diff > 0, "unplaced sorts after placed");
});

test("a project order is valid only when every entry is a real ref", () => {
  assert.ok(isValidProjectOrder([REF_A, REF_B], 10));
  assert.ok(isValidProjectOrder([], 10), "an empty order is valid");
  assert.equal(isValidProjectOrder([REF_A, "not-a-ref"], 10), false);
  assert.equal(isValidProjectOrder([REF_A.toUpperCase()], 10), false, "refs are lowercase");
  assert.equal(isValidProjectOrder([REF_A.slice(1)], 10), false, "refs are exactly 20 characters");
  assert.equal(isValidProjectOrder([123], 10), false);
  assert.equal(isValidProjectOrder("not an array", 10), false);
  assert.equal(isValidProjectOrder(null, 10), false);
});

test("a project order is refused once it exceeds the cap", () => {
  assert.ok(isValidProjectOrder(Array(10).fill(REF_A), 10));
  assert.equal(isValidProjectOrder(Array(11).fill(REF_A), 10), false);
});

test("repeats collapse to the first position of each ref", () => {
  // One account connected by both PAT and OAuth lists its projects twice. Sending that array made
  // reorder_projects abort with "cannot affect row a second time" — every drag dead for that user.
  assert.deepEqual(dedupeRefs([REF_A, REF_B, REF_A]), [REF_A, REF_B]);
  assert.deepEqual(dedupeRefs([REF_A, REF_A, REF_A]), [REF_A]);
  assert.deepEqual(dedupeRefs([REF_C, REF_B, REF_A]), [REF_C, REF_B, REF_A], "order preserved");
  assert.deepEqual(dedupeRefs([]), []);
});

test("reordering is allowed only with every control at its default", () => {
  const clean = { sort: "manual" as const, search: "", owner: ALL, status: ALL, tag: ALL };
  assert.ok(isReorderable(clean));

  assert.equal(isReorderable({ ...clean, sort: "name" }), false, "a column sort reorders the view");
  assert.equal(isReorderable({ ...clean, search: "prod" }), false);
  assert.equal(isReorderable({ ...clean, owner: "someone" }), false);
  assert.equal(isReorderable({ ...clean, status: "INACTIVE" }), false);
  assert.equal(isReorderable({ ...clean, tag: "live" }), false);
});

test("whitespace-only search does not block reordering, matching the filter that ignores it", () => {
  const clean = { sort: "manual" as const, search: "   ", owner: ALL, status: ALL, tag: ALL };
  assert.ok(isReorderable(clean), "the filter trims too, so the two must agree");
});
