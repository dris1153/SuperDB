/**
 * One user's history, out of the log stream.
 *
 * **Two sources, and the original shows both.** `auth_logs` is GoTrue's API log — a row per request,
 * with a status and a path — and `auth_audit_logs` is the audit trail, a row per event. Supabase's
 * own panel interleaves them: its list carries `/token | request completed` next to a bare `Login`.
 *
 * An earlier note in this repository said `auth_logs` carries no user id and could not answer "what
 * did this user do". Measured 2026-09-26, that is false: `log_attributes['user_id']` matched 13 rows
 * for the measured user, and `status`, `path`, `level` and `msg` are selectable directly. The claim
 * came from reading a few rows' top-level message fields and generalising from them.
 */
export type UserEvent = {
  at: string;
  /** Which source it came from — the two render differently because they say different things. */
  kind: "request" | "audit";
  /** `request`: the HTTP status. `audit`: nothing. */
  status: number | null;
  /** `request`: the path. `audit`: nothing. */
  path: string | null;
  /** `request`: `request completed`. `audit`: the action, as a sentence. */
  message: string;
  /** Who did it, when the row says and it was not the user themselves. */
  actor: string | null;
  ip: string | null;
  failed: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AUTH_LOG_SOURCE = "auth_logs";
export const AUDIT_LOG_SOURCE = "auth_audit_logs";

/** One row of the merged read, before it is understood. */
export type UserLogRow = {
  timestamp: string;
  source: string;
  status?: string | null;
  path?: string | null;
  level?: string | null;
  event_message: string | null;
};

/**
 * The statement, for a user id that has already been checked.
 *
 * **Both audit keys, not just the subject.** Measured: filtering on
 * `auth_audit_event.traits.user_id` alone returned 2 rows for a user with 8 — the signup and the
 * deletion, the things done *to* them — while `auth_audit_event.actor_id` held the six they did
 * themselves.
 *
 * The bracket form is the one that works; `` log_attributes.`dotted.key` `` answers
 * `Backend error! Retry your query`, as most things on that endpoint do. The two-source shape with
 * its nested `or` was measured before it was written: 34 rows, both kinds interleaved.
 *
 * The id is interpolated into the SQL, so it is re-checked here rather than trusted — this is a
 * string going into a query, and the check is all that stands between a caller and the rest of the
 * stream.
 */
export function buildUserLogsSql(userId: string): string {
  if (!UUID.test(userId)) throw new Error("That is not a user.");

  return `select timestamp, source,
  log_attributes['status'] as status,
  log_attributes['path'] as path,
  log_attributes['level'] as level,
  event_message
from logs
where (source = '${AUTH_LOG_SOURCE}' and log_attributes['user_id'] = '${userId}')
   or (source = '${AUDIT_LOG_SOURCE}' and (log_attributes['auth_audit_event.traits.user_id'] = '${userId}'
        or log_attributes['auth_audit_event.actor_id'] = '${userId}'))
order by timestamp desc
limit 100`;
}

type RawAudit = {
  auth_audit_event?: {
    action?: unknown;
    actor_id?: unknown;
    actor_username?: unknown;
    created_at?: unknown;
    ip_address?: unknown;
  };
};

type RawRequest = { msg?: unknown; method?: unknown; path?: unknown; level?: unknown; remote_addr?: unknown };

const str = (value: unknown) => (typeof value === "string" && value ? value : null);

/**
 * A row's `timestamp` carries no zone — `2026-09-25T19:20:37.481143` — while an audit event's own
 * `created_at` ends in `Z`. Mixing the two is what put a 19:20 request *below* a 19:14 event on the
 * first run: `Date.parse` reads the zoneless one as local time, which in Vietnam moves it seven
 * hours into the past.
 *
 * The same fact `parseLogTime` in `lib/logs-sql.ts` documents, applied where two shapes meet.
 */
const zoned = (raw: string) => (/[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);

/**
 * One row, understood.
 *
 * Returns null rather than throwing on anything that does not parse: these are log lines, and one
 * unfamiliar row should cost its own entry rather than the whole tab.
 */
export function parseUserLog(row: UserLogRow, userId: string): UserEvent | null {
  if (!row?.event_message) return null;

  let body: unknown;
  try {
    body = JSON.parse(row.event_message);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;

  if (row.source === AUDIT_LOG_SOURCE) {
    const event = (body as RawAudit).auth_audit_event;
    if (!event || typeof event !== "object") return null;

    const action = str(event.action);
    if (!action) return null;

    const actorId = str(event.actor_id);

    return {
      // The audit event's own timestamp when it has one; the row's otherwise.
      at: zoned(str(event.created_at) ?? row.timestamp),
      kind: "audit",
      status: null,
      path: null,
      message: describeAction(action),
      actor: actorId === userId ? null : str(event.actor_username),
      ip: str(event.ip_address),
      // An audit row records something that happened, not something that failed.
      failed: false,
    };
  }

  const request = body as RawRequest;
  const status = Number(row.status);
  const level = str(row.level) ?? str(request.level);

  return {
    at: zoned(row.timestamp),
    kind: "request",
    status: Number.isInteger(status) && status >= 100 && status < 600 ? status : null,
    path: str(row.path) ?? str(request.path),
    message: [str(request.method), str(request.msg) ?? "request"].filter(Boolean).join(" "),
    actor: null,
    ip: str(request.remote_addr),
    // Measured on the project this was built against: `level` is `info` on 933 rows and `warning`
    // on one, and a 404 exists. Both readings count, because neither covers the other.
    failed: (Number.isInteger(status) && status >= 400) || level === "warning" || level === "error",
  };
}

/**
 * Newest first by the event's own time.
 *
 * The query orders by the row's `timestamp`, which is when the line was ingested — close to the
 * event but not it. Seven audit events inside the same second came back visibly out of order
 * without this, because the list shows `created_at` and the sort used the other one.
 */
export const sortEvents = (events: UserEvent[]): UserEvent[] =>
  [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/** `user_recovery_requested` reads as "Recovery requested", which is what the dashboard shows. */
export const describeAction = (action: string): string => {
  const words = action.replace(/^user_/, "").replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
};
