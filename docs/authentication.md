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

`/config/auth` returns 243 fields. This page shows about twenty-five, and the part picks rather than
passes through — the rest carries every configured OAuth provider's client secret.

**PATCH merges by key**, so each save sends only what it changed. Three things about that endpoint
are worth knowing before touching it:

- **A refusal is not always a no-op.** A PATCH carrying a template field *and* a notification field
  answered 400 for the template and **applied the notification anyway**. Each action here saves one
  kind of field, so a reported failure means that kind did not land.
- **An unknown field is accepted and ignored.** `{superdb_not_a_field: true}` answers 200. Nothing
  upstream catches a typo, which is why `lib/auth-config.ts` is a catalogue and field names are
  never taken from the caller.
- **Template editing is gated by plan.** On a free project using the default mail provider, a PATCH
  to any template field answers `400 "Email template modification is not available for free tier
  projects using the default email provider."` `/config/auth` does not report which plan a project
  is on, so the save is attempted and the API's own sentence is what shows.

`smtp_pass` goes one way: written, never read back, never in a part, and never in the audit line —
which records that SMTP changed, not what it changed to. An empty password box means "leave it",
not "clear it".

The seven security notifications each also have a subject and a body of their own
(`mailer_subjects_password_changed_notification` and friends). This page toggles them; editing those
bodies is a later addition.

## Sending mail

`POST /admin/generate_link {type, email}` mints a link **and sends the mail** — the call came back
with `recovery_sent_at` set on the user. `invite` creates the user as well.

**It does not spend the project's hourly allowance.** `rate_limit_email_sent` was 2 on the measured
project, and the page was designed around warning about that — then nine consecutive sends all
answered 200. The limit governs user-initiated mail; the admin endpoint is not what it guards. The
buttons therefore say what is true: the mail goes out at once, cannot be recalled, and nothing here
limits how many. The 429 branch stays for projects configured differently.

## OAuth apps

The endpoint is **gated, not missing**: with the server off it answers
`404 {"error_code":"feature_disabled"}`, which the reader turns into a state the page shows a banner
for rather than an error.

Turning it on needs both `oauth_server_enabled` and `oauth_server_authorization_path` in one PATCH —
either alone is refused — and **GoTrue takes about a minute to notice**. A page that enabled it and
listed in the same breath would show "disabled" over a setting just turned on, so the banner says
so. The page links to the setting rather than offering the switch: becoming an identity provider is
a configuration decision, not a step in creating an app.

The list answers `{}` when empty and `{"clients":[…]}` when not, so `body.clients ?? []` is not
enough — the same trap `listSigningKeys` has a test for, arriving a second time.

`client_secret` is **not** in the list. It is in the 201 from create and in a single-client read, so
the create dialog is the only place this app shows it — and says that, rather than claiming the
secret is unrecoverable. It is deliberately never written to the audit line.

## A user's audit trail

`auth_logs` is GoTrue's application log — `component`, `level`, `msg` — and carries no user id, so
it cannot answer "what did this user do". `auth_audit_logs` can, and `log_attributes` flattens its
nested JSON into dotted keys.

Filtering needs **both** keys:

```sql
log_attributes['auth_audit_event.traits.user_id'] = '<id>'   -- done to them
log_attributes['auth_audit_event.actor_id']      = '<id>'    -- done by them
```

Measured on one probe user: two rows and six. `traits.user_id` alone would have shown a quarter of
that user's history — the signup and the deletion — and missed every recovery they requested
themselves. The bracket form is the one the endpoint accepts; the backtick form fails. See
[logs.md](./logs.md) for the rest of what that endpoint will and will not do.

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
- **"A PATCH either applies or does not."** One call refused a template and applied a switch.
