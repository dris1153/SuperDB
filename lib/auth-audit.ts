/**
 * One user's auth events, out of the log stream.
 *
 * `auth_logs` cannot answer this — it is GoTrue's application log and carries no user. The audit
 * trail is `auth_audit_logs`, where `log_attributes` flattens the nested JSON into dotted keys.
 */
export type AuditEvent = {
  at: string;
  action: string;
  actorUsername: string | null;
  actorId: string | null;
  ip: string | null;
  /** True when the user this panel is about did it, rather than had it done to them. */
  byThisUser: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The statement, for a user id that has already been checked.
 *
 * **Both keys, not just the subject.** Measured 2026-09-26: filtering on
 * `auth_audit_event.traits.user_id` alone returned 2 rows for a user with 8 — signup and deletion,
 * the things done *to* them — while `auth_audit_event.actor_id` held the six they did themselves.
 * A Logs tab showing only half of that would be worse than one showing none.
 *
 * The bracket form is the one that works. `` log_attributes.`dotted.key` `` answers
 * `Backend error! Retry your query`, as most things do on this endpoint.
 *
 * The id is interpolated into the SQL, so it is re-checked here rather than trusted: this is a
 * string going into a query, and the only thing standing between a caller and the rest of the
 * stream is that it has to look like a UUID.
 */
export function buildUserAuditSql(userId: string): string {
  if (!UUID.test(userId)) throw new Error("That is not a user.");

  return `select timestamp, event_message
from logs
where source = 'auth_audit_logs'
  and (log_attributes['auth_audit_event.traits.user_id'] = '${userId}'
    or log_attributes['auth_audit_event.actor_id'] = '${userId}')
order by timestamp desc
limit 100`;
}

type RawEvent = {
  auth_audit_event?: {
    action?: unknown;
    actor_id?: unknown;
    actor_username?: unknown;
    created_at?: unknown;
    ip_address?: unknown;
  };
};

const str = (value: unknown) => (typeof value === "string" && value ? value : null);

/**
 * One row's message, which is JSON in a string.
 *
 * Returns null rather than throwing on anything that does not parse: this is a log line, and one
 * unfamiliar row should cost its own entry rather than the whole tab.
 */
export function parseAuditEvent(
  message: string | null,
  timestamp: string,
  userId: string,
): AuditEvent | null {
  if (!message) return null;

  let raw: RawEvent;
  try {
    raw = JSON.parse(message) as RawEvent;
  } catch {
    return null;
  }

  const event = raw.auth_audit_event;
  if (!event || typeof event !== "object") return null;

  const action = str(event.action);
  if (!action) return null;

  const actorId = str(event.actor_id);

  return {
    // The audit event's own timestamp when it has one; the row's otherwise.
    at: str(event.created_at) ?? timestamp,
    action,
    actorUsername: str(event.actor_username),
    actorId,
    ip: str(event.ip_address),
    byThisUser: actorId === userId,
  };
}

/**
 * Newest first by the event's own time.
 *
 * The query orders by the row's `timestamp`, which is when the line was ingested — close to the
 * event but not it. Seven events inside the same second came back visibly out of order without
 * this, because the list shows `created_at` and the sort used the other one.
 */
export const sortEvents = (events: AuditEvent[]): AuditEvent[] =>
  [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/** `user_recovery_requested` reads as "Recovery requested", which is what the dashboard shows. */
export const describeAction = (action: string): string => {
  const words = action.replace(/^user_/, "").replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
};
