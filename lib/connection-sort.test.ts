import assert from "node:assert/strict";
import test from "node:test";
import {
  accountSortKey,
  nextConnectionSort,
  parseConnectionSort,
  serialiseConnectionSort,
  sortConnections,
  type SortKeys,
} from "./connection-sort.ts";

type Row = { name: string } & SortKeys;

const row = (name: string, over: Partial<SortKeys> = {}): Row => ({
  name,
  owner: name,
  kind: "pat",
  account: "",
  added: "2026-01-01T00:00:00Z",
  ...over,
});

const keys = (r: Row): SortKeys => r;
const names = (rows: Row[]) => rows.map((r) => r.name);

test("parses the wire format", () => {
  assert.deepEqual(parseConnectionSort("owner.asc"), { column: "owner", dir: "asc" });
  assert.deepEqual(parseConnectionSort("added.desc"), { column: "added", dir: "desc" });
});

test("refuses anything it does not recognise rather than guessing", () => {
  assert.equal(parseConnectionSort(undefined), null);
  assert.equal(parseConnectionSort(null), null);
  assert.equal(parseConnectionSort(""), null);
  assert.equal(parseConnectionSort("owner"), null, "no direction");
  assert.equal(parseConnectionSort("owner.sideways"), null);
  assert.equal(parseConnectionSort("tags.asc"), null, "not a sortable column");
  assert.equal(parseConnectionSort(".asc"), null, "no column");
  assert.equal(parseConnectionSort("token_hint.asc"), null);
});

test("round trips", () => {
  for (const wire of ["owner.asc", "kind.desc", "account.asc", "added.desc"]) {
    assert.equal(serialiseConnectionSort(parseConnectionSort(wire)!), wire);
  }
});

test("cycles a column through ascending, descending, then back to the manual order", () => {
  const first = nextConnectionSort(null, "owner");
  assert.deepEqual(first, { column: "owner", dir: "asc" });

  const second = nextConnectionSort(first, "owner");
  assert.deepEqual(second, { column: "owner", dir: "desc" });

  assert.equal(nextConnectionSort(second, "owner"), null, "third click restores the manual order");
});

test("switching column starts that column ascending", () => {
  assert.deepEqual(nextConnectionSort({ column: "owner", dir: "desc" }, "added"), {
    column: "added",
    dir: "asc",
  });
});

test("no sort leaves the manual order untouched, and does not copy", () => {
  const rows = [row("c"), row("a"), row("b")];
  const result = sortConnections(rows, null, keys);
  assert.equal(result, rows, "same reference — the caller's array is already the answer");
  assert.deepEqual(names(result), ["c", "a", "b"]);
});

test("sorting does not mutate the manual order it was given", () => {
  const rows = [row("c"), row("a"), row("b")];
  sortConnections(rows, { column: "owner", dir: "asc" }, keys);
  assert.deepEqual(names(rows), ["c", "a", "b"]);
});

test("sorts ascending and descending", () => {
  const rows = [row("c"), row("a"), row("b")];
  assert.deepEqual(names(sortConnections(rows, { column: "owner", dir: "asc" }, keys)), ["a", "b", "c"]);
  assert.deepEqual(names(sortConnections(rows, { column: "owner", dir: "desc" }, keys)), ["c", "b", "a"]);
});

test("added sorts chronologically because the key is an ISO timestamp", () => {
  const rows = [
    row("sep", { added: "2026-09-05T00:00:00Z" }),
    row("aug", { added: "2026-08-25T00:00:00Z" }),
    row("dec", { added: "2026-12-01T00:00:00Z" }),
  ];
  assert.deepEqual(names(sortConnections(rows, { column: "added", dir: "asc" }, keys)), [
    "aug",
    "sep",
    "dec",
  ]);
});

test("an unset account stays last in both directions", () => {
  const rows = [
    row("none"),
    row("zoe", { account: "zoe@example.com" }),
    row("amy", { account: "amy@example.com" }),
  ];
  assert.deepEqual(names(sortConnections(rows, { column: "account", dir: "asc" }, keys)), [
    "amy",
    "zoe",
    "none",
  ]);
  assert.deepEqual(names(sortConnections(rows, { column: "account", dir: "desc" }, keys)), [
    "zoe",
    "amy",
    "none",
  ]);
});

test("the account key prefers the email, so one alphabet orders the column", () => {
  assert.equal(accountSortKey("Email + password", "zoe@example.com"), "zoe@example.com");
  assert.equal(accountSortKey("GitHub", null), "GitHub", "method only when there is no address");
  assert.equal(accountSortKey(null, null), "", "nothing stored sorts last");
  assert.equal(accountSortKey(null, "  "), "", "whitespace is not an address");
  assert.equal(accountSortKey("SSO", "  amy@example.com  "), "amy@example.com");
});

test("account rows sort by address regardless of method", () => {
  const rows = [
    row("github-zoe", { account: accountSortKey("GitHub", "zoe@example.com") }),
    row("email-amy", { account: accountSortKey("Email + password", "amy@example.com") }),
    row("method-only", { account: accountSortKey("SSO", null) }),
    row("nothing", { account: accountSortKey(null, null) }),
  ];

  assert.deepEqual(names(sortConnections(rows, { column: "account", dir: "asc" }, keys)), [
    "email-amy",
    "method-only",
    "github-zoe",
    "nothing",
  ]);
});
