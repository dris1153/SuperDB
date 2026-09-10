import assert from "node:assert/strict";
import test from "node:test";
import { PROJECT_SORTS, sortProjects } from "./project-sort.ts";
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

test("connection order is returned untouched, not copied", () => {
  const rows = [row("c"), row("a"), row("b")];
  const result = sortProjects(rows, "connection");
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
  assert.equal(PROJECT_SORTS[0].value, "connection");
  assert.equal(PROJECT_SORTS.length, 5);
  for (const option of PROJECT_SORTS) assert.ok(option.label.length > 0, option.value);
});
