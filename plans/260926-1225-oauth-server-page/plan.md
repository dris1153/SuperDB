---
title: "OAuth Server, as the original has it"
status: in-progress  # built; not looked at in a browser
created: 2026-09-26
blockedBy: []
blocks: []
---

# OAuth Server, as the original has it

The one page OAuth Apps has been sending people out of this app for. Its "OAuth Server Settings"
button opens the Supabase dashboard because there was nothing here to switch the server on with.

Read from the original's source (`apps/studio/components/interfaces/Auth/OAuthApps/
OAuthServerSettingsForm.tsx` and `OAuthEndpointsTable.tsx`), not from the screenshot alone: the
screenshot shows the server off, and everything below the switch only renders once it is on.

## Phase 1 — the page (single phase)

| Status | Effort |
|---|---|
| in-progress | ~3h |

### What the original has

1. **Enable the Supabase OAuth Server** — a switch with its sentence. On, it reveals:
   - **Site URL**, read only, "configured in Auth URL Configuration settings".
   - **Authorization Path**, default `/oauth/consent`, required while on, with a note under it:
     *Make sure this path is implemented in your application. Preview Authorization URL:
     `{site_url}{path}`* — or *Set a Site URL to preview*.
   - **Allow Dynamic OAuth Apps**, whose switch opens a warning confirm before it turns on.
2. **Cancel** and **Save changes**, Save enabled only when something moved. One PATCH carries all
   three fields.
3. **Turning the server off with apps registered** asks first: *You have N active OAuth apps that
   will be deactivated.*
4. **OAuth Endpoints** — Authorization, Token, JWKS, OIDC discovery, each read only with copy.
   Rendered only when the server is on in the *saved* config, not merely switched on in the form.

### What is already known

- **Both projects have the server off**, path `null`, dynamic registration `false` — read
  2026-09-26.
- **The discovery document is public and answers while the server is off.**
  `GET https://{ref}.supabase.co/auth/v1/.well-known/openid-configuration` → 200 with no key, on both
  projects, with the server disabled. So the endpoints come from the issuer Supabase reports rather
  than from a string this app assembles — which stays right on a custom domain.
- **`oauth_server_enabled` alone is refused**; it must travel with `oauth_server_authorization_path`
  (measured 2026-09-25). The original always sends all three fields, and so does this.
- **GoTrue notices about a minute later** (measured 2026-09-25). A save says so.

### Gates — measured on ZKVault, restored after; never on SuperDB

1. Disabling while a path is set: is `{enabled: false, path: "/oauth/consent"}` accepted, and what
   reads back?
2. A path without a leading slash: accepted, refused, or normalised? The preview concatenates, so a
   missing slash builds a wrong URL.
3. **Do apps survive a disable and re-enable?** The original's confirm says "deactivated" and "You can
   re-enable the OAuth Server at any time". If apps are deleted instead, this page's confirm says
   *deleted* — it does not copy a sentence that would be false here.

### Decisions

- **Endpoints card: built**, from discovery.
- **The disable confirm appears only when apps exist**, as in the original, and names the count.
- **Site URL links out**, with an icon — this app has no URL Configuration page, the same rule OAuth
  Apps follows for Docs.
- **The nav gains an `OAuth Server` row** under Configuration, with the original's BETA badge.
- **OAuth Apps' settings button becomes an internal link** to this page.

### Related code files

- Create: `app/(app)/p/[ref]/auth/oauth-server/page.tsx`
- Create: `components/auth/oauth-server-settings.tsx` — the form
- Create: `components/auth/oauth-endpoints.tsx` — the endpoints card
- Create: `components/auth/oauth-server-dialogs.tsx` — the two confirms
- Create: `lib/oauth-server.ts` (+ test) — pick and validate the three fields; not in
  `lib/auth-config.ts`, which is the Emails catalogue and already past 200 lines
- Create: `lib/oauth-server-actions.ts` — `saveOAuthServer`, audited through `recordWrite`
- Modify: `lib/project-part-names.ts`, `lib/project-parts.ts`, `lib/part-cache.ts` — the
  `oauth-server` part, uncached
- Modify: `components/auth/auth-nav.tsx` — the row
- Modify: `components/auth/oauth-apps.tsx` — the button
- Modify: `docs/authentication.md` — what the gates found

### Success criteria

- [x] The switch reflects the saved config; turning it on reveals the three fields.
- [x] Save is refused with a message, not sent, when the path is empty while on.
- [x] A save sends exactly the three fields, is audited, and says it takes about a minute.
- [x] Dynamic registration asks before turning on.
- [x] Disabling with apps registered asks first, and its wording matches what gate 3 measured.
- [x] The endpoints card shows the four URLs from discovery once the server is saved on.
- [x] `pnpm typecheck`, `lint`, `test`, `build` green.

### Risks

- **Disabling breaks every third-party app signing in through this project.** The confirm is the
  mitigation, and it states the count.
- **Dynamic registration opens a public endpoint anyone can register clients on.** The confirm
  carries the original's phishing warning.
- **The project with real users must not be the one measured against.**

## Built 2026-09-26 — all three gates answered, on ZKVault, restored

```
{enabled: true,  path: "oauth/consent"}   400 "OAUTH_SERVER_AUTHORIZATION_PATH must be a valid URL path starting with "/""
{enabled: true,  path: "/oauth/consent"}  200
{allow_dynamic_registration: true}        200 alone
{enabled: true,  path: ""}                400 "…must be set when OAUTH_SERVER_ENABLED is true"
created one client                        201; list 200, 1 client
{enabled: false, path: "/oauth/consent"}  200; path reads back; list 404 feature_disabled
re-enabled                                200; list 200, the same 1 client
restored                                  enabled false, path null, dynamic false
```

1. Disabling with a path set is accepted and keeps the path.
2. A path without the slash is refused, so `oauthServerPatch` refuses it first, with the same rule.
3. **Clients survive** — the confirm keeps the original's "deactivated".

Criteria above were checked by the tests and the build, not in a browser.
