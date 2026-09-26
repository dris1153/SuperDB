# Authentication

A project's users, the mail it sends them, and the apps that can sign them in. It is a page under
the project rather than a settings section, because `/config/auth` configures the users it sits
beside.

Modules: [`lib/auth-api.ts`](../lib/auth-api.ts) (the GoTrue client),
[`lib/auth-users.ts`](../lib/auth-users.ts), [`lib/auth-config.ts`](../lib/auth-config.ts),
[`lib/oauth-clients.ts`](../lib/oauth-clients.ts), [`lib/auth-audit.ts`](../lib/auth-audit.ts) —
each pure and tested apart from the client — with the server actions beside them and the screens in
[`components/auth/`](../components/auth/).

## Two APIs, and only one of them takes this app's token

The Management API's entire auth surface is four paths:

```
GET,PATCH  /v1/projects/{ref}/config/auth
           /v1/projects/{ref}/config/auth/signing-keys
           /v1/projects/{ref}/config/auth/sso/providers
           /v1/projects/{ref}/config/auth/third-party-auth
```

**No users. No OAuth clients.** Those live on the project's own GoTrue, which refuses the token this
app authenticates with:

```
GET https://{ref}.supabase.co/auth/v1/admin/users
  with service_role      200
  with a Management PAT  401 {"message":"No API key found in request"}
```

So Users, OAuth Apps and a user's audit trail go through [`projectKey()`](../lib/project-key.ts) —
the `service_role` machinery Storage built — under the same containment rules: `server-only`, never
returned through a part, never stored. Emails needs none of that: it is `/config/auth` alone.

## Users

`?filter=` is a substring match that narrows `x-total-count` **server side**. `?email=` is accepted
and ignored, which is worse than an error: the whole list comes back looking like a search that
matched everything. Nothing here sends it.

Paging comes from the headers — `x-total-count` for the total, and `link` carrying `rel="next"` only
while there is a next page. The next-page control reads the header rather than doing arithmetic on
the total, because the API is the one counting.

**A listed user is not a fetched user.** `identities` is null in a listing and populated only in a
single read, so the details panel fetches the user again rather than rendering the row it was opened
from. `email_confirmed_at` and `confirmed_at` are *absent*, not null, on a user created with
`email_confirm: false` — a dash in that column means "never confirmed", not "not read".

Two states the plain fields hide, so the table badges them: an unconfirmed email, and a ban that is
**in force now**. GoTrue leaves `banned_until` behind after an unban, so reading the field alone
labels the wrong people.

Ban and unban are the same call — `PUT {ban_duration: "24h"}` and `PUT {ban_duration: "none"}` — and
the durations are Go duration strings, which have no unit above the hour. A week is `168h`; `7d` is
a parse error.

Delete takes the email address typed out, the way destructive paths elsewhere in this app take the
project name. Whether it is soft or hard is unmeasured, and nothing in the UI promises either.

`providerTypeOf` is **our rule, not Supabase's**: the dashboard shows a Provider type column and the
API returns no such field, so it is derived from the providers list.

## Emails

Templates, SMTP and the mail-sending actions have a page of their own:
[Authentication emails](./auth-emails.md). The short version: `/config/auth` merges by key, can
refuse one field and apply another in the same call, ignores unknown fields, has no API for
resetting a template, and wants `smtp_port` as a string but `smtp_max_frequency` as a number.

## OAuth apps

The endpoint is **gated, not missing**: with the server off it answers
`404 {"error_code":"feature_disabled"}`, which the reader turns into a state the page shows a banner
for rather than an error.

Turning it on needs both `oauth_server_enabled` and `oauth_server_authorization_path` in one PATCH —
either alone is refused — and **GoTrue takes about a minute to notice**. A page that enabled it and
listed in the same breath would show "disabled" over a setting just turned on, so the banner says
so. Its "OAuth Server Settings" button leads to the page below rather than putting the switch here:
becoming an identity provider is a configuration decision, not a step in creating an app.

The list answers `{}` when empty and `{"clients":[…]}` when not, so `body.clients ?? []` is not
enough — the same trap `listSigningKeys` has a test for, arriving a second time.

`client_secret` is **not** in the list. It is in the 201 from create and in a single-client read, so
the create dialog is the only place this app shows it — and says that, rather than claiming the
secret is unrecoverable. It is deliberately never written to the audit line.

## OAuth Server

Three fields of `/config/auth` and `site_url`, plus the project's public discovery document for the
endpoints card. Measured on a scratch project, 2026-09-26:

```
{enabled: true,  path: "oauth/consent"}   400 "…must be a valid URL path starting with "/""
{enabled: true,  path: ""}                400 "…must be set when OAUTH_SERVER_ENABLED is true"
{enabled: false, path: "/oauth/consent"}  200, and the path reads back
{allow_dynamic_registration: true}        200 on its own
```

`lib/oauth-server.ts` refuses the first two before sending, and every save carries all three fields.
**Clients survive a disable**: one registered before it was listed again after re-enabling, so the
confirm says "deactivated" as the original does. The discovery document answers 200 with no key while
the server is off; the endpoints come from its `issuer` rather than from a URL assembled here.

## A user's audit trail

**Both log sources answer, and an earlier version of this page said otherwise.** It claimed
`auth_logs` "carries no user id, so it cannot answer what did this user do". Measured 2026-09-26,
that is false — the claim came from reading a few rows' top-level message fields and generalising:

```
select count(*) from logs
where source = 'auth_logs' and log_attributes['user_id'] = '91983d71-…'    ->  13

select log_attributes['status'], log_attributes['path'], log_attributes['msg'] …
  ->  {"msg":"request completed","path":"/user","status":"200"}
```

So `auth_logs` gives the request rows — a status, a path, a method — and `auth_audit_logs` gives the
events. The panel reads both in one statement, which the endpoint accepts, and interleaves them as
Supabase's own panel does.

The audit half needs **both** of its keys:

```sql
log_attributes['auth_audit_event.traits.user_id'] = '<id>'   -- done to them
log_attributes['auth_audit_event.actor_id']      = '<id>'    -- done by them
```

Measured on one probe user: two rows and six. `traits.user_id` alone would have shown a quarter of
that user's history — the signup and the deletion — and missed every recovery they requested
themselves. The bracket form is the one the endpoint accepts; the backtick form fails. See
[logs.md](./logs.md) for the rest of what that endpoint will and will not do.

**The two sources timestamp differently, and mixing them sorts wrongly.** An audit event carries its
own `created_at` ending in `Z`; a row's `timestamp` carries no zone at all. `Date.parse` reads the
second as local time, which in Vietnam is seven hours out — on the first live run a 19:20 request
sorted *below* a 19:14 event. Every timestamp is normalised before anything compares them.

The user id is interpolated into the SQL, so `buildUserAuditSql` re-checks it is a UUID and throws
otherwise.

Retention is short and volume is low — nine audit rows against four thousand pgbouncer ones on the
measured project — so **an empty tab is the normal case** and must not read as a failure.

## Server actions

Every export in `lib/auth-user-actions.ts`, `lib/auth-config-actions.ts` and
`lib/oauth-client-actions.ts` is an HTTP endpoint any signed-in browser can call with any arguments,
and TypeScript is erased by the time one arrives. So ids, durations, link types, email addresses and
field names are all re-checked at runtime, **before** the audit line is written.

User ids reach a URL path, which is why `isUserId` runs first: `..` survives `encodeURIComponent`
and the URL parser resolves it before the request leaves, aiming a `service_role` DELETE somewhere
else. This is the same class of bug found in `rotateToStandby` during the JWT keys work.

## What was believed and turned out false

Five claims in the plan and its research did not survive the build, each corrected in place:

- **"`generate_link` exhausts the quota in two clicks."** Nine sends, no refusal.
- **"Custom templates just need SMTP."** They are refused by plan, with a specific message.
- **"`client_secret` exists only in the 201."** A single-client read returns it too.
- **"Filtering the audit trail is a comparison on `traits.user_id`."** That is half of it.
- **"`auth_logs` carries no user id."** It does — `log_attributes['user_id']` — and this page said
  the opposite until 2026-09-26.
- **"A PATCH either applies or does not."** One call refused a template and applied a switch.
