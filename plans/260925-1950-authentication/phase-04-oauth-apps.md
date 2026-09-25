---
phase: 4
title: "OAuth Apps"
status: pending
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

**`client_secret` exists only in the 201 from create.** Neither the list nor a single read carries
it. The create dialog is the only place it can ever be copied from, and it has to say so — the same
shape as a secret API key.

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

- [ ] A project with the server off shows the banner, not an error.
- [ ] An empty list renders as empty rather than throwing on `{}`.
- [ ] Creating shows the secret once and says it cannot be retrieved.
- [ ] Deleting removes the row.

## Risk Assessment

- **Enabling the OAuth server makes the project an identity provider.** The page links to the
  setting rather than offering the switch, because turning it on is a configuration decision rather
  than a step in creating an app.
