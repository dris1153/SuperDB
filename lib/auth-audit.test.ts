import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildUserAuditSql, describeAction, parseAuditEvent, sortEvents } from "./auth-audit.ts";

const UID = "0b8b800d-a513-49d9-b579-cf0f9ecf4f7b";

test("the statement asks about the user as subject and as actor", () => {
  const sql = buildUserAuditSql(UID);

  // Measured: traits alone returned 2 rows for a user with 8 — the signup and the deletion. The
  // other six were things the user did, which live under actor_id.
  assert.ok(sql.includes("log_attributes['auth_audit_event.traits.user_id']"));
  assert.ok(sql.includes("log_attributes['auth_audit_event.actor_id']"));
  assert.ok(sql.includes(" or "));
  assert.ok(sql.includes("'auth_audit_logs'"), "auth_logs carries no user id at all");
  // The backtick form answers `Backend error! Retry your query`.
  assert.ok(!sql.includes("`"));
});

test("the id is re-checked before it is interpolated into the query", () => {
  // It goes into the SQL as a quoted string, so this check is what stands between a caller and the
  // rest of the project's log stream.
  for (const bad of ["", "not-a-uuid", `${UID}' or '1'='1`, "../../x"]) {
    assert.throws(() => buildUserAuditSql(bad), /not a user/, `for ${JSON.stringify(bad)}`);
  }
  assert.doesNotThrow(() => buildUserAuditSql(UID));
});

const message = (event: Record<string, unknown>) => JSON.stringify({ auth_audit_event: event });

test("an event is read out of the JSON the message holds", () => {
  const parsed = parseAuditEvent(
    message({
      action: "user_recovery_requested",
      actor_id: UID,
      actor_username: "someone@example.com",
      created_at: "2026-09-25T17:32:21Z",
      ip_address: "1.2.3.4",
    }),
    "2026-09-25T17:32:22.000000",
    UID,
  );

  assert.equal(parsed?.action, "user_recovery_requested");
  assert.equal(parsed?.ip, "1.2.3.4");
  assert.equal(parsed?.at, "2026-09-25T17:32:21Z", "the event's own time, not the row's");
  assert.equal(parsed?.byThisUser, true);
});

test("an administrator's action on the user is not the user's own", () => {
  const parsed = parseAuditEvent(
    message({
      action: "user_deleted",
      actor_id: "00000000-0000-0000-0000-000000000000",
      actor_username: "service_role",
    }),
    "2026-09-25T17:32:22.000000",
    UID,
  );

  assert.equal(parsed?.byThisUser, false);
  assert.equal(parsed?.actorUsername, "service_role");
  assert.equal(parsed?.at, "2026-09-25T17:32:22.000000", "falls back to the row's timestamp");
});

test("a row that makes no sense costs itself, not the tab", () => {
  assert.equal(parseAuditEvent(null, "t", UID), null);
  assert.equal(parseAuditEvent("not json", "t", UID), null);
  assert.equal(parseAuditEvent("{}", "t", UID), null);
  assert.equal(parseAuditEvent(message({}), "t", UID), null, "no action is no event");
  assert.equal(parseAuditEvent(JSON.stringify({ auth_audit_event: "text" }), "t", UID), null);
});

test("an action reads as a sentence", () => {
  assert.equal(describeAction("user_recovery_requested"), "Recovery requested");
  assert.equal(describeAction("user_signedup"), "Signedup");
  assert.equal(describeAction("login"), "Login");
  assert.equal(describeAction("user_"), "user_", "nothing left to make a sentence from");
});

test("events read newest first by their own time, not by when the line was ingested", () => {
  // Seven events inside one second came back visibly jumbled: the query orders by the row's
  // `timestamp` and the list shows the event's `created_at`.
  const event = (at: string) =>
    ({ at, action: "user_recovery_requested", actorUsername: null, actorId: null, ip: null, byThisUser: true });

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
