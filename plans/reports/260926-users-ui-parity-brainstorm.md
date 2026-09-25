# Users page: what the original does that ours does not

Six screenshots compared 2026-09-26 — two of the shipped page, four of Supabase's own. Everything
below is read off those, plus measurements against `kupekvmyzqypwrtnjlid`.

## The table

| | Ours | Original |
|---|---|---|
| Row start | goes straight to UID | **checkbox**, then **avatar** |
| UID | truncated with an ellipsis | full |
| Phone | `—` | `-` |
| Providers | lowercase text badge `github` | **icon + `GitHub`** |
| Provider type | `OAuth` | **`Social`** |
| Timestamps | `2026-08-25` | `Tue 25 Aug 2026 09:40:19 GMT+0700` |
| Toolbar | one search box, Columns, Add user | **field selector**, search, All columns, **Sorted by user ID**, **refresh**, Add user **split button** |
| Grid | no column rules | column rules, horizontal scroll |

`Provider type` is the sharper one: `providerTypeOf` invented `OAuth` / `Basic Auth` / `SSO` because
the API returns no such field. The original's word is **Social**. Ours was a guess and it reads as a
different product.

## The panel

Ours: title, UID, tabs, a six-row list, a provider box, two buttons, a danger box.

The original, in order: **tabs at the top** with the close button, then name + email with a copy
control, then an eight-row attribute table — `User UID`, `Created at`, **`Updated at`**,
**`Invited at`**, **`Confirmation sent at`**, `Confirmed at`, `Last signed in`, **`SSO`** — then
*Provider Information* as a card carrying the provider's icon, a sentence ("Signed in with a GitHub
account via OAuth"), an **Enabled** badge and a configure button; then two action rows, each with a
description beside its button; then *Danger zone* with its own warning line and three rows —
**Remove MFA factors**, Ban user, Delete user — each described.

Four of those eight attribute rows are missing from ours. They are all in the response already; the
part reader picks them out.

## The Logs tab, and a claim this session got wrong

Ours reads `auth_audit_logs` and lists actions. The original lists **API requests** — status codes
and paths like `/token` and `/admin/users/{id}` — over the past hour.

`docs/authentication.md` says `auth_logs` "carries no user id, so it cannot answer what did this
user do". **Measured 2026-09-26, that is false:**

```
select count(*) from logs
where source = 'auth_logs' and log_attributes['user_id'] = '91983d71-…'   ->  13
```

And the fields the original's table shows are selectable directly:

```
select log_attributes['status'], log_attributes['path'], log_attributes['msg'] …
  ->  {"msg":"request completed","path":"/user","status":"200"}
```

The earlier claim came from reading a few rows' top-level message fields and generalising. The
correction belongs in `docs/authentication.md` as part of this work.

Looking again at the original's list, one row reads `| Login` with **no status and no path** — that
is an `auth_audit_logs` row sitting among the request rows. The original merges both sources.

## Decisions

- **Table: everything, including the checkbox column and bulk delete.** Chosen over display-only.
- **Logs: match the original**, now that the measurement says it is possible.
- **Panel: rebuilt**, without the prev/next user arrows.

## Two things deliberately not copied

- **"Configure GitHub provider"** and **"Open in Log Explorer"** both lead to pages this app does not
  have. A button that goes nowhere is worse than no button.
- **The search-field dropdown will not be decorative.** The admin API has exactly one `?filter=`, a
  substring match. So Email and Phone send `filter`, and **UID reads the user directly** through
  `GET /admin/users/{id}` — the control changes behaviour rather than only the placeholder.

## Two measurements the plan must make first

1. **Does the admin users endpoint sort?** If it does not, "Sorted by user ID" can only sort the
   fifty rows on screen, which is wrong the moment there are two pages. Then the control does not
   ship.
2. **Does the log endpoint accept the merged query** — two sources, each with its own `or` group?
   Its tolerance for nesting is unmeasured, and `docs/logs.md` lists what it refuses.

## Risks

- **Bulk delete acts on real people's accounts**, one request each, with no undo. It confirms, it
  reports which rows failed, and it never reports success for a batch that partly failed.
- **Avatars are third-party URLs** — `avatars.githubusercontent.com` in the measured user. Rendering
  one leaks a page view to that host and fails closed to initials if it does not load.
