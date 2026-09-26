# Supabase Auth, measured

2026-09-25, against `nnjdwpswuynozmzfaioc` with a full-access personal access token. The user
measurements ran against three throwaway accounts created for the purpose and deleted afterwards;
the project has no users, which is where it started.

Where this disagrees with `260925-auth-research.md`, this wins. It disagrees about server-side
filtering, which is the single decision that shapes the Users page.

## The split

The Management API's entire auth surface, grepped from the OpenAPI spec:

```
GET,PATCH  /v1/projects/{ref}/config/auth
           /v1/projects/{ref}/config/auth/signing-keys          (already built)
           /v1/projects/{ref}/config/auth/sso/providers
           /v1/projects/{ref}/config/auth/third-party-auth
```

**No users. No OAuth clients.** `/v1/oauth/*` exists but is Supabase's own platform OAuth, not the
project's.

Users live on the project's GoTrue, and it does not take the token this app authenticates with:

```
GET https://{ref}.supabase.co/auth/v1/admin/users
  with service_role         200
  with a Management PAT     401 {"message":"No API key found in request",
                                 "hint":"No `apikey` request header or url param was found."}
```

So Users and OAuth Apps need `projectKey()` — the machinery Storage built. Emails does not.

## `/config/auth` has 243 fields

Enough for the whole Emails page without touching the project's own API:

- **SMTP**: `smtp_admin_email`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`,
  `smtp_sender_name`, `smtp_max_frequency`.
- **Subjects**: `mailer_subjects_confirmation`, `_invite`, `_magic_link`, `_email_change`,
  `_recovery`, `_reauthentication`, plus seven `_notification` subjects.
- **Bodies**: the matching `mailer_templates_*_content` family.
- **Security notification toggles**: `mailer_notifications_password_changed_enabled`,
  `_email_changed_`, `_phone_changed_`, `_identity_linked_`, `_identity_unlinked_`,
  `_mfa_factor_enrolled_`, `_mfa_factor_unenrolled_` — exactly the seven switches in the screenshot.

`mailer_subjects_custom_contents` is a map of booleans saying which subjects have been customised:

```json
{"MAILER_SUBJECTS_CONFIRMATION": false, "MAILER_SUBJECTS_INVITE": false, ...}
```

Measured values worth knowing: `rate_limit_email_sent = 2` (per hour, on default SMTP),
`smtp_max_frequency = 60`, `smtp_host = null`.

## Listing users

```
GET /auth/v1/admin/users?page=1&per_page=2
  x-total-count: 3
  link: </admin/users?page=2&per_page=2>; rel="next", </admin/users?page=2&per_page=2>; rel="last"
  {"users": [...], "aud": "authenticated"}
```

Both headers are present and usable: `x-total-count` is the "Total: 1 user" line in the dashboard,
and `link` carries `rel="next"` only while there is one.

### `?filter=` works server-side. `?email=` does not.

The research report says there is no server-side filtering and a dashboard must filter in the
browser. Measured:

```
GET /admin/users?filter=1790339059242-1                      x-total-count: 1   one user returned
GET /admin/users?email=superdb-probe-...-1@example.com       x-total-count: 3   all three returned
```

`filter` is a substring match and narrows the count; `email` is ignored entirely. This matters:
client-side filtering would mean paging every user into the browser to search a project with
thousands of them.

### A listed user is not a fetched user

In the list, `identities` is **null**. Reading one user returns the array in full, with
`identity_id`, `provider`, `identity_data` and `last_sign_in_at`. The details panel therefore needs
its own read; the table cannot populate it.

Fields present only once the state exists: `email_confirmed_at` and `confirmed_at` are absent on a
user created with `email_confirm: false`.

## Lifecycle

```
POST /admin/users            {email, password, email_confirm, user_metadata}   200, returns the user
PUT  /admin/users/{id}       {ban_duration: "1h"}                              200
PUT  /admin/users/{id}       {ban_duration: "none"}                            200  (the unban)
DELETE /admin/users/{id}                                                       200
GET  /admin/users/{id}/factors                                                 200  []
POST /admin/generate_link    {type: "magiclink", email}                        200
```

`generate_link` came back with **`recovery_sent_at` set**, so it does not merely mint a link.

**The quota claim that followed was wrong.** This report said it spends `rate_limit_email_sent`,
which is 2 an hour, and that two clicks exhaust a project's allowance. Measured 2026-09-26 while
building the page: nine consecutive `generate_link` calls — magiclink, recovery and invite — all
answered 200. The admin endpoint does not appear to spend the hourly allowance a user-initiated
send does. The limit still exists in `/config/auth`; it is not what guards this page.

`email_confirm: true` on create produces `email_confirmed_at` immediately, which is the
"Auto confirm user?" checkbox in the screenshot.

## OAuth clients

The endpoint exists and is gated on a config flag rather than missing:

```
GET /auth/v1/admin/oauth/clients   404 {"error_code":"feature_disabled","msg":"OAuth server is disabled"}
```

The flag is in `/config/auth`: `oauth_server_enabled`, alongside
`oauth_server_allow_dynamic_registration` and `oauth_server_authorization_path`. Writing it alone is
refused:

```
PATCH {oauth_server_enabled: true}
  400 "Both OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH must be provided together
       when updating OAuth configuration"
```

Sending both answers 200, and **the auth service picks it up about a minute later** — not
immediately:

```
+0m  GET /admin/oauth/clients  404 feature_disabled
+1m  GET /admin/oauth/clients  200 {}
```

So a UI that enables the server and reads the list in the same breath will show "disabled" over a
setting that was just turned on. Whatever builds this has to say the change takes a moment.

Creating one:

```
POST /admin/oauth/clients {client_name, redirect_uris, client_type}   201
{
  "client_id": "2914761a-…",
  "client_secret": "5LJfb7T4PH…",          <- returned here and nowhere else
  "client_type": "confidential",
  "redirect_uris": ["https://example.com/cb"],
  "token_endpoint_auth_method": "client_secret_basic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "client_name": "superdb-probe",
  "registration_type": "manual",
  "created_at": "…", "updated_at": "…"
}
```

`DELETE /admin/oauth/clients/{client_id}` answers **204**.

The five columns in the dashboard's table — name, client id, client type, registration type,
created — are all in that body, so the list is enough to render it.

**An empty list answers `{}`.** A populated one answers `{"clients": […]}`:

```
GET /admin/oauth/clients   (none)  200  {}
GET /admin/oauth/clients   (two)   200  {"clients":[{client_id, client_type, redirect_uris,
                                          token_endpoint_auth_method, grant_types, response_types,
                                          client_name, registration_type, created_at, updated_at}, …]}
```

So `body.clients` is `undefined` on an empty project, and `?? []` is not enough — this is the trap
`listSigningKeys` already has a test for, arriving a second time. `Array.isArray(body?.clients)`.

`client_secret` is **not** in the list. It is in the 201 from create — and, corrected 2026-09-26,
in a single `GET /admin/oauth/clients/{id}` as well, which this report previously denied. The app
only ever lists, so the create dialog remains the one place it appears there; the difference is that
it is recoverable from Supabase rather than lost.

`token_endpoint_auth_method` follows `client_type`: `client_secret_basic` for confidential,
`none` for public.

The probe restored `oauth_server_enabled` to false and the path to null.

## Unmeasured

- `POST /admin/invite` and `/recover`: both send mail, and the limit is two an hour.
- Whether a deleted user is soft- or hard-deleted.
- MFA factor removal, there being no enrolled factor to remove.
- Rate limits on the admin endpoints themselves; none were hit at this volume.

---

# The logs endpoint, and a shipped feature that is broken

Measured while checking whether the user panel's Logs tab was buildable. It is not, and the reason
is bigger than that tab.

## `logs.all` is gone

```
GET /v1/projects/{ref}/analytics/endpoints/logs.all
  410 "The logs.all endpoint has been removed. Use /v1/projects/{ref}/analytics/endpoints/logs
       instead."
```

`queryLogs` in `lib/mgmt-api.ts` calls `logs.all`. So the Logs page and every card reading a log
source answers an error today.

## The replacement is one stream, not one table per service

The old model was a table per service — `auth_logs`, `postgres_logs`, `edge_logs` — which is what
`lib/logs-sql.ts` is built around. All of them now answer `Table "…" does not exist.`

The new endpoint takes SQL over a single table called **`logs`**:

```
select count(*) as n from logs            200  {"result":[{"n":3279}]}
select id, timestamp, event_message       200  {"error":"Field \"id\" does not exist."}   (no FROM)
```

With no `sql` at all it returns a default page of the stream, and a row looks like this:

```json
{
  "event_message": "C-0x…: postgres/pgbouncer@[::1]:56711 login attempt: db=postgres …",
  "id": "0b808dfd-…",
  "severity_text": "INFO",
  "source": "pgbouncer_logs",
  "timestamp": "2026-09-25T12:49:33.481143",
  "log_attributes": {"_RUNTIME_SCOPE": "system", "host": "db-…", "project": "…"},
  "project": "…"
}
```

So the service is a **column**, not a table: `where source = 'auth_logs'` replaces `from auth_logs`,
and `metadata` unnested per source is replaced by a flat `log_attributes`.

## It throttles hard

`ThrottlerException: Too Many Requests` after roughly six requests, and twelve seconds of spacing
was not enough to clear it. Seventy seconds was. Measuring this endpoint is slow, and a UI that
polls it will be throttled.

## What this means

Fixing `queryLogs` and `lib/logs-sql.ts` is its own piece of work against a changed API, not a line
edit. It is unrelated to Authentication except that the user panel's Logs tab needs it first.

## The sources, and the one that carries a user id

```
pgbouncer_logs 4061 · auth_logs 120 · edge_logs 114 · storage_logs 98
postgrest_logs 86 · postgres_logs 79 · realtime_logs 17 · auth_audit_logs 9
```

The names survived; they are column values now rather than tables.

**`auth_logs` is GoTrue's application log** — `component`, `level`, `msg`. No user id, so it cannot
answer "what did this user do".

**`auth_audit_logs` can.** A row, from the probe's own user deletion:

```json
"auth_audit_event.action": "user_deleted",
"auth_audit_event.actor_id": "00000000-0000-0000-0000-000000000000",
"auth_audit_event.actor_username": "service_role",
"auth_audit_event.traits.user_id": "6d770d51-…",
"auth_audit_event.traits.user_email": "superdb-probe-…@example.com"
```

`log_attributes` flattens the nested JSON into dotted keys, so filtering to one user is a comparison
on `auth_audit_event.traits.user_id` rather than an unnest.

So the user panel's Logs tab **is** buildable — against `auth_audit_logs`, not `auth_logs`, and only
once `queryLogs` speaks to the endpoint that still exists.

## Severity, per source

```
auth_logs        INFO · WARNING
postgres_logs    LOG · ERROR · FATAL
realtime_logs    INFO · WARN · ERROR
storage_logs     INFO · WARNING · ERROR
postgrest_logs   INFO
edge_logs        INFO  — only ever INFO, including a row whose message is "DELETE | 204 | …"
```

Each source keeps its own vocabulary, which is what `lib/logs-sql.ts` already encodes — the change
is where it is read from, not what it means. Five of the six can be classified from `severity_text`
alone.

**Edge cannot.** An HTTP status never reaches `severity_text`, so that branch still needs the
status, and the status is in the flattened attributes:

```
response.status_code   204
response.origin_time   101
request.method         DELETE
request.url            https://…/auth/v1/admin/oauth/clients/…
```

Forty-seven keys on that row, and worth noticing before anything renders them raw:
`request.sb.jwt.apikey.payload.role` is in there, holding `service_role`.

**Answered 2026-09-26.** The bracket form is the one that works:
`log_attributes['auth_audit_event.traits.user_id'] = '…'` filters server-side; the backtick form
answers `Backend error! Retry your query`. Filtering a user's own history needs **both**
`traits.user_id` (done to them) and `actor_id` (done by them) — 2 rows and 6 for the same probe
user — joined with `or`, which the endpoint also accepts.
