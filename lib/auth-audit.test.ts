import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  AUDIT_LOG_SOURCE,
  AUTH_LOG_SOURCE,
  buildUserLogsSql,
  describeAction,
  parseUserLog,
  sortEvents,
  type UserEvent,
  type UserLogRow,
} from "./auth-audit.ts";

const UID = "0b8b800d-a513-49d9-b579-cf0f9ecf4f7b";

test("the statement asks both sources, and the audit one by both of its keys", () => {
  const sql = buildUserLogsSql(UID);

  assert.ok(sql.includes(`source = '${AUTH_LOG_SOURCE}'`));
  assert.ok(sql.includes(`source = '${AUDIT_LOG_SOURCE}'`));

  // The request log carries the user it was about.
  assert.ok(sql.includes("log_attributes['user_id']"));
  // Measured: traits alone returned 2 rows for a user with 8 — the signup and the deletion. The
  // other six were things the user did, which live under actor_id.
  assert.ok(sql.includes("log_attributes['auth_audit_event.traits.user_id']"));
  assert.ok(sql.includes("log_attributes['auth_audit_event.actor_id']"));

  // The backtick form answers `Backend error! Retry your query`.
  assert.ok(!sql.includes("`"));
});

test("the id is re-checked before it is interpolated into the query", () => {
  // It goes into the SQL as a quoted string, so this check is what stands between a caller and the
  // rest of the project's log stream.
  for (const bad of ["", "not-a-uuid", `${UID}' or '1'='1`, "../../x"]) {
    assert.throws(() => buildUserLogsSql(bad), /not a user/, `for ${JSON.stringify(bad)}`);
  }
  assert.doesNotThrow(() => buildUserLogsSql(UID));
});

const auditRow = (event: Record<string, unknown>, timestamp = "2026-09-25T17:32:22.000000"): UserLogRow => ({
  timestamp,
  source: AUDIT_LOG_SOURCE,
  event_message: JSON.stringify({ auth_audit_event: event }),
});

const requestRow = (rest: Partial<UserLogRow> & { message?: Record<string, unknown> } = {}): UserLogRow => ({
  timestamp: "2026-09-25T19:00:00.000000",
  source: AUTH_LOG_SOURCE,
  status: "200",
  path: "/user",
  level: "info",
  event_message: JSON.stringify({
    component: "api",
    level: "info",
    method: "GET",
    msg: "request completed",
    path: "/user",
    remote_addr: "1.2.3.4",
    ...rest.message,
  }),
  ...rest,
});

test("a request row reads as a request", () => {
  const event = parseUserLog(requestRow(), UID);

  assert.equal(event?.kind, "request");
  assert.equal(event?.status, 200);
  assert.equal(event?.path, "/user");
  assert.equal(event?.message, "GET request completed");
  assert.equal(event?.ip, "1.2.3.4");
  assert.equal(event?.failed, false);
});

test("a failure is a bad status or a level that is not info", () => {
  // Measured on the project this was built against: `level` is `info` on 933 rows and `warning` on
  // one, and a 404 exists. Neither reading covers the other.
  assert.equal(parseUserLog(requestRow({ status: "404" }), UID)?.failed, true);
  assert.equal(parseUserLog(requestRow({ status: "500" }), UID)?.failed, true);
  assert.equal(parseUserLog(requestRow({ level: "warning" }), UID)?.failed, true);
  assert.equal(parseUserLog(requestRow({ level: "error" }), UID)?.failed, true);
  assert.equal(parseUserLog(requestRow({ status: "" }), UID)?.failed, false, "no status is not a failure");
  assert.equal(parseUserLog(requestRow(), UID)?.failed, false);
});

test("an audit row reads as an event, with its own time", () => {
  const event = parseUserLog(
    auditRow({
      action: "user_recovery_requested",
      actor_id: UID,
      actor_username: "someone@example.com",
      created_at: "2026-09-25T17:32:21Z",
      ip_address: "1.2.3.4",
    }),
    UID,
  );

  assert.equal(event?.kind, "audit");
  assert.equal(event?.message, "Recovery requested");
  assert.equal(event?.at, "2026-09-25T17:32:21Z", "the event's own time, not the row's");
  assert.equal(event?.actor, null, "the user did it themselves, so nobody else is named");
  assert.equal(event?.status, null);
});

test("an administrator's action names the administrator", () => {
  const event = parseUserLog(
    auditRow({ action: "user_deleted", actor_id: "00000000-0000-0000-0000-000000000000", actor_username: "service_role" }),
    UID,
  );

  assert.equal(event?.actor, "service_role");
  assert.equal(event?.at, "2026-09-25T17:32:22.000000Z", "falls back to the row's timestamp");
});

test("a row that makes no sense costs itself, not the tab", () => {
  const base = { timestamp: "t", source: AUDIT_LOG_SOURCE };

  assert.equal(parseUserLog({ ...base, event_message: null }, UID), null);
  assert.equal(parseUserLog({ ...base, event_message: "not json" }, UID), null);
  assert.equal(parseUserLog({ ...base, event_message: "{}" }, UID), null);
  assert.equal(parseUserLog(auditRow({}), UID), null, "no action is no event");
  assert.equal(
    parseUserLog({ ...base, event_message: JSON.stringify({ auth_audit_event: "text" }) }, UID),
    null,
  );
});

test("an action reads as a sentence", () => {
  assert.equal(describeAction("user_recovery_requested"), "Recovery requested");
  assert.equal(describeAction("token_refreshed"), "Token refreshed");
  assert.equal(describeAction("login"), "Login");
  assert.equal(describeAction("user_"), "user_", "nothing left to make a sentence from");
});

test("events read newest first by their own time, not by when the line was ingested", () => {
  // Seven events inside one second came back visibly jumbled: the query orders by the row's
  // `timestamp` and the list shows the event's `created_at`.
  const event = (at: string): UserEvent => ({
    at,
    kind: "audit",
    status: null,
    path: null,
    message: "Recovery requested",
    actor: null,
    ip: null,
    failed: false,
  });

  const sorted = sortEvents([
    event("2026-09-25T17:32:22.175Z"),
    event("2026-09-25T17:32:22.408Z"),
    event("2026-09-25T17:32:21.319Z"),
  ]);

  assert.deepEqual(
    sorted.map((e) => e.at),
    ["2026-09-25T17:32:22.408Z", "2026-09-25T17:32:22.175Z", "2026-09-25T17:32:21.319Z"],
  );
});

test("a row's zoneless timestamp is read as UTC, or the two sources interleave wrongly", () => {
  // The first live run put a 19:20 request below a 19:14 audit event: an audit event carries its own
  // `created_at` ending in Z, a row's `timestamp` carries no zone at all, and `Date.parse` reads the
  // second as local time — seven hours out, in Vietnam.
  const request = parseUserLog(requestRow({ timestamp: "2026-09-25T19:20:37.481143" }), UID);
  const audit = parseUserLog(
    auditRow({ action: "login", created_at: "2026-09-25T19:14:29.000Z" }),
    UID,
  );

  assert.equal(request?.at, "2026-09-25T19:20:37.481143Z");
  assert.deepEqual(
    sortEvents([audit!, request!]).map((e) => e.kind),
    ["request", "audit"],
    "the later request sorts above the earlier event",
  );
});
