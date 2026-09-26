---
phase: 4
title: "OAuth Apps"
status: completed
priority: P3
effort: "5h"
dependencies: [1]
---

# Phase 4: OAuth Apps

## Overview

The clients that can use this project as an identity provider, and the banner for when that is
switched off.

## Architecture

**The endpoint is gated, not missing.**

```
GET /auth/v1/admin/oauth/clients   404 {"error_code":"feature_disabled","msg":"OAuth server is disabled"}
```

The flag is `oauth_server_enabled` in `/config/auth`, and writing it alone is refused:

```
PATCH {oauth_server_enabled: true}
  400 "Both OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH must be provided together"
```

**And GoTrue takes about a minute to notice.** Measured: `+0m` still reported `feature_disabled`,
`+1m` answered 200. So enabling and then listing in the same breath shows "disabled" over a setting
that was just turned on — the page has to say the change takes a moment.

**The list's shape is the `listSigningKeys` trap again:**

```
GET /admin/oauth/clients   (none)  200  {}
GET /admin/oauth/clients   (two)   200  {"clients":[…]}
```

`body.clients` is `undefined` on an empty project, so `?? []` is not enough.

**`client_secret` is not in the list.** It is in the 201 from create — and, corrected while
building, in a single `GET /admin/oauth/clients/{id}` too. This app only ever lists, so the create
dialog is still the only place it appears here; the dialog says that rather than claiming the
secret is unrecoverable, which would have been false.

`token_endpoint_auth_method` follows `client_type`: `client_secret_basic` for confidential, `none`
for public. It is derived, not chosen.

## Related Code Files

- Create: `app/(app)/p/[ref]/auth/oauth-apps/page.tsx`
- Create: `components/auth/oauth-apps.tsx`, `oauth-app-dialog.tsx`
- Create: `lib/oauth-clients.ts` (+ test), `lib/oauth-client-actions.ts`

## Implementation Steps

1. `lib/oauth-clients.ts`: the `OAuthClient` type and the list unwrap, with a test for `{}` and for
   `{clients: []}`.
2. A part for the clients, tolerating the disabled state as an empty result with a reason rather
   than an error.
3. The banner from the screenshot when the server is off, with a link to the setting.
4. The table: name, client id, client type, registration type, created.
5. Create, with the secret shown once and a warning that it will not be shown again.
6. Delete, which answers 204.

## Success Criteria

- [x] A project with the server off shows the banner, not an error.
- [x] An empty list renders as empty rather than throwing on `{}`.
- [x] Creating shows the secret once and says it cannot be retrieved.
- [x] Deleting removes the row.

## Risk Assessment

- **Enabling the OAuth server makes the project an identity provider.** The page links to the
  setting rather than offering the switch, because turning it on is a configuration decision rather
  than a step in creating an app.

## Verified end to end, 2026-09-26

```
GET  clients (server off)          404 {"error_code":"feature_disabled"}  -> the banner, not an error
PATCH {oauth_server_enabled}       400 "must be provided together …"
PATCH both fields                  200
GET  clients (immediately)         404 feature_disabled     <- still off, as the banner warns
GET  clients (+75s)                200 {}                   <- the empty shape, no `clients` key
POST clients                       201 client_secret present
GET  clients (one exists)          200 {"clients":[…]}, no client_secret in the row
GET  clients/{id}                  200 client_secret IS present   <- corrects the earlier report
DELETE clients/{id}                204
GET  clients                       200 {}
```

`oauth_server_enabled` and the authorization path were restored to false and null.

**Not exercised:** a public client, which returns no secret and closes the dialog instead of
showing one. The branch exists; nothing has run it.
