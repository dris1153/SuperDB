---
title: "Project access: open the original, copy what signs in to it"
status: in-progress  # built and checked in a throwaway route; not clicked signed in
created: 2026-09-26
blockedBy: []
blocks: []
---

# Project access: open the original, copy what signs in to it

The app exists to hold many accounts' projects in one place. The original dashboard holds one signed-in
account per browser, so reaching a project there means knowing which account owns it and having its
sign-in to hand. This puts both one click from any project page.

| # | Phase | Status |
|---|---|---|
| 1 | Data + `dashboardUrl` (tested) | **completed** |
| 2 | The shared panel, the topbar island, bundle measured | **completed** |
| 3 | Overview card, `/connections?edit=<id>`, visual check, docs | **completed** |

## Decisions (brainstorm 2026-09-26)

- **Both places**: a topbar button *Open in Supabase ↗* plus an account chip whose popover holds the
  panel; the same panel as a card on Overview.
- **Deep link to the page in view**: routes already mirror the original's. Targets read from
  `supabase/supabase` `apps/studio/pages/project/[ref]/` on 2026-09-26. Anything unmapped falls back to
  the project home.
- **Copy**: account email; Supabase password and email password as the sign-in method requires
  (`lib/credential-methods.ts`); the project's DB password; ref and URL. No API keys — the Connect
  sheet has them.
- **Missing sign-in details**: a link to `/connections?edit=<id>` opening the Credentials tab.
- **No read in the layout**: the popover asks the `access` part (a GET, TTL 0) on every open; the
  Overview page reads on the server. Not a server action: actions run one at a time per client, so a
  long `runSql` would hold the popover. Navigation latency is this branch's subject.
- **Ciphertext only crosses the wire**: blobs decrypt in the browser through `useVaultSecret`.

## Phase 1 — data and the link

- `lib/connection-secrets.ts`-style server reader for one connection's row (`connection_secrets`,
  owner-scoped by RLS) and a `"use server"` action `projectAccess(ref)`: `resolveProject(ref)` →
  `{ connectionId, account, orgName, method, email, accountBlob, dbBlob }`.
- `lib/dashboard-url.ts` pure `dashboardUrl(ref, pathname)` + test. Map: `/auth`→`auth/users`,
  `/auth/oauth`→`auth/oauth-apps`, `/auth/oauth-server`, `/auth/emails*`→`auth/templates`,
  `/database`→`database/schemas`, `/database/{schemas,tables,functions,types,policies}` as is
  (`tables/[name]` → the list: the original keys tables by oid), `/tables`→`editor`, `/sql`→`sql/new`,
  `/storage`→`storage/files`, `/storage/b/[b]`→`storage/files/buckets/[b]`,
  `/storage/{analytics,s3,vectors}`, `/settings`→`settings/general`, `/settings/api-keys`,
  `/settings/jwt-keys`→`settings/jwt`, `/settings/passwords`→`database/settings`.

## Phase 2 — panel and topbar

- `ProjectAccessPanel` (client): Account (name · org, method, email + copy); Passwords behind an
  inline vault unlock; Project (ref, URL + copy); *Open this page* / *Open project home*.
- Topbar stays a server component; two small client islands: the link (reads `usePathname`) and the
  chip, whose popover content is `next/dynamic` on first open.
- **Gate**: first-load JS of `/p/[ref]/settings` before and after; +5KB at most.

## Phase 3 — Overview, Connections, checks

- Overview card reusing the panel with server-read data.
- `/connections?edit=<id>` opens that row's dialog on the Credentials tab.
- Throwaway preview route, screenshots, then delete it; README "Credential vault" section.

## Success criteria

- [x] From any project page, one click opens the same page in the original.
- [x] Email, passwords, DB password, ref and URL copy from the popover and the Overview card.
- [x] Passwords never reach the server in plaintext; a locked vault asks inline.
- [x] Project-route first-load JS grows by ≤5KB.
- [x] typecheck, lint, test, build green.

## Built 2026-09-26

- `lib/project-access.ts` (server-only) serves the `access` part and the Overview page; the chip's
  popover is `React.lazy`, with a fallback chip if its chunk fails to load (no error boundary sits
  above the project layout).
- First-load JS: `/p/[ref]/settings` 655,390 → 659,110 bytes (+3.7KB); Overview 834,252 → 844,760
  (+10.5KB, the panel renders there on load).
- Headless Chrome on a throwaway route with a throwaway vault: unlocked, each Copy put the right
  plaintext on the clipboard; the GitHub method shows no password rows. Route and vault deleted.
- Review: no security findings; the three medium ones (lazy chunk failure, server-action queueing,
  no refetch on reopen) are fixed. **Not clicked signed in**: the part against a real project, and
  `/connections?edit=<id>`.

## Revised 2026-09-26

- **Overview card removed** at the user's request; the topbar popover is the one place. Overview reads
  the DB password blob as before, and its first load is back to +3.7KB (the topbar islands).
- **First open was slow** — chunk load, then the part request, in series. Both now start together
  once the project page is idle (`requestIdleCallback`, a timer on Safari); measured in a throwaway
  route: chunks and `/access` requested ~140ms after load, before any click.
- First-load JS: `/p/[ref]/settings` 659,454 bytes, Overview 838,018.

## The database password cannot be read — measured 2026-09-26

- Postgres keeps a SCRAM verifier, not the password. The Management API spec's only password
  endpoint is `PATCH /v1/projects/{ref}/database/password`, answering `{ message }`. An unsaved
  password can only be replaced, so the panel links *Set one* to Settings › Passwords, which resets it
  and stores it in the vault.
- Considered and not built: `POST /v1/projects/{ref}/cli/login-role` (beta, scope `database:write`).
  On ZKVault it answered 201 with `cli_login_supabase_read_only_user` (`read_only: true`) or
  `cli_login_postgres`, a 32-character password and `ttl_seconds: 300`; both connected through the
  pooler (5432, 6543) and directly; neither could create a table in `public` as connected;
  `DELETE` removed every CLI login role (`user not found` after). Five minutes, beta, and a DELETE
  that would also cut off a running Supabase CLI.
