---
type: scout-report
date: 2026-08-29
scope: whole project
branch: dev
head: 7ca1726
---

# Scout Report — SuperDB Architecture

## Summary

SuperDB is a **multi-account Supabase dashboard**: it aggregates every project across every
Supabase account/organization a user owns into one board, then offers a per-project workspace
that mirrors the Supabase dashboard. ~7,400 LOC across `app/`, `lib/`, `components/`.

Stack: Next.js 16.3.2 (App Router) + React 19.2 + Tailwind v4 (CSS-first) + shadcn/ui
(`radix-nova` style) + Supabase (Auth + Postgres) + Supabase Management API.
No ORM, no data-fetching library, no test framework (`node:test`).

Baseline health at time of scout: `tsc --noEmit` clean, 60/60 tests pass.

## Architecture at a glance

```
Browser --+- proxy.ts (Next 16 middleware) -- session + MFA gate
          |
          +- app/(app)/**        Server Components, force-dynamic, all data fetching
          |    +- inline "use server" actions passed as props -> client leaves
          |
          +- components/**       35/49 are "use client" leaves (Radix state, clipboard,
          |                      IndexedDB, WebCrypto)
          |
          +- lib/**              server-only domain logic
               +- supabase/server.ts   own Supabase project (accounts, encrypted tokens)
               +- mgmt-api.ts          api.supabase.com (user's projects)
```

Two distinct Supabase relationships:

1. **SuperDB's own project** — stores users, connections, audit events, vault metadata. RLS-scoped.
2. **The user's projects** — reached through the Management API with a PAT or OAuth access token.

## Layer 1 — Routing & auth (`app/`, `proxy.ts`)

- **`proxy.ts` is Next 16's renamed `middleware.ts`** (confirmed in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Exports `proxy()` + `config.matcher`. No `middleware.ts` exists.
- Gate order: `getUser()` (revalidates JWT, not `getSession()`) → public-path allowlist → signed-out-only bounce → MFA `aal1→aal2` redirect to `/mfa`.
- `/reset-password` is deliberately **not** public: `/auth/confirm` must establish the recovery session first.
- Every page is a Server Component. Zero `"use client"` in `app/`. Five pages carry `export const dynamic = "force-dynamic"`.
- `(app)` route group = auth + chrome boundary; auth pages sit outside it so they render with no sidebar.
- `p/[ref]` — `ref` is a Supabase project ref, validated `/^[a-z]{20}$/`. `resolveProject()` is wrapped in React `cache()` because both layout and page call it and each call fans out one API request per connection.
- `project-nav.tsx` declares 13 nav slugs; only **Overview** and **Database** are `ready: true`. The other 11 render disabled with a "soon" chip.
- Next 16 APIs in use: async `params`/`searchParams`, `await cookies()`, `proxy.ts`. **Not** used: `cacheComponents`, `"use cache"`, `cacheLife`/`cacheTag`.

**Two OAuth flows, easy to confuse:**

| | Purpose | Impl |
|---|---|---|
| `app/auth/*` | User signs into SuperDB (GitHub or email+password) | `@supabase/ssr` |
| `app/api/connect/*` | SuperDB authorizes against a Supabase *organization* | hand-rolled `lib/oauth.ts` |

The second is authorization-code + PKCE (S256) with confidential-client Basic auth. Three details
that are easy to get wrong are documented in-file: the token body must be form-encoded, credentials
go in an `Authorization: Basic` header, and the `scope` query param is deprecated (scopes are fixed
at OAuth-app registration).

## Layer 2 — Domain logic (`lib/`)

### Connections (`lib/connections.ts`, 300 LOC — the hub)

A **connection** = one credential granting access to one Supabase organization. Kind is `pat | oauth`,
toggled per-deployment by `CONNECT_MODES`.

- `SAFE_COLUMNS` allowlist never selects `dek_wrapped`/`secret_cipher`, so the type is safe to hand to a client component.
- Token refresh is **proactive**: refreshes at `expires_at - 5min`. A failed refresh writes `last_error` and throws `Reconnect required` — no retry loop, because failure means upstream revocation.
- `write()` is select-then-update-or-insert (not upsert) so `display_name` and `tags` are **insert-only** — re-authorizing never clobbers user-chosen names/tags. `org_name` stays in "always" so it follows upstream renames.
- Identity comes from `listOrgs()[0]`, not `/v1/profile`: Supabase no longer issues user-scoped tokens, so `/v1/profile` is unreachable forever.

### Management API (`lib/mgmt-api.ts`)

One `call<T>()` helper, `Bearer` token, `cache: "no-store"`, identical for PAT and OAuth. 15 endpoints.
Three hard-won behaviours, each with a regression test:

- Error bodies capped at **2000** chars (was 300, which severed Supabase's own JSON explanations mid-string).
- Empty-body 200s handled via `res.text()` + conditional parse (`POST /restore` returns 200 with no body).
- `queryLogs` inspects the envelope — Logflare answers 200 with `error` populated for bad SQL.

### Two independent encryption schemes

| | Tokens | Account passwords |
|---|---|---|
| Module | `lib/crypto.ts` (`server-only`) | `lib/vault-crypto.ts` (browser-only) |
| Scheme | AES-256-GCM envelope, DEK per secret wrapped by `ENCRYPTION_KEY` | PBKDF2-HMAC-SHA256 @ 600k iters → non-extractable AES-GCM key |
| Key lives | env var (no KDF — the var *is* the key) | derived in browser, stored in IndexedDB, 8h expiry |
| Server can read? | **Yes** — must, for unattended OAuth refresh | **No** — zero-knowledge by construction |
| Format | `iv.tag.ciphertext` (3 parts) | `iv.ciphertext` (2 parts, GCM tag appended) |

`lib/crypto.ts:31-37` is unusually candid: envelope encryption buys no extra secrecy while the master
key sits in an env var. It exists so rotation is a rewrap of short DEKs, and so moving to a KMS is a
one-function change. Real protection: a stolen DB dump, not a compromised server.

### Observability

- `prometheus.ts` — hand-rolled exposition-format parser (the metrics endpoint isn't JSON). `memoryUsedPercent` uses `MemTotal - MemAvailable`, not `MemFree`.
- `logs-sql.ts` — one `union all` SQL over six log sources with three different severity vocabularies, joined into a single query specifically to stay under the API rate limit. Gap-fills buckets so bar widths track the window, not traffic.
- `db-introspect.ts` — two schema-qualified read-only queries; excludes 16 Supabase plumbing schemas but keeps `auth` and `storage`.
- `inventory.ts` — parallel fan-out; a broken token degrades into `errors[]` rather than failing the page.

### Safety helpers

- `safe.ts::describe()` distinguishes two Supabase refusals that mean opposite things: `403 missing required scopes` (re-authorize fixes it) vs `401 does not support oauth access yet` (platform gap, no scope helps). Parses the JSON body rather than regexing it.
- `safe-path.ts` — 8 lines, open-redirect guard. Blocks `//evil.com`, which `startsWith("/")` accepts.
- `audit.ts` — never throws ("a lost log line is bad, a connect that fails because logging failed is worse").

## Layer 3 — UI (`components/`)

- 35 of 49 files are `"use client"`. Pages fetch; client components are interactive leaves.
- **Server actions are defined inline in the page** and passed as props. Exceptions are on-demand RPC modules (`connect-actions`, `framework-actions`, `orm-actions`, `vault-actions`, `mfa-actions`) imported directly by clients.
- **No `useActionState` / `useOptimistic` / `useFormStatus`** anywhere — consistently `useTransition` + manual `pending`.
- **No `error.tsx` / `loading.tsx` / `not-found.tsx`, no ErrorBoundary.** Failures are handled as data: `safe.ts::attempt()` returns `{ok, data} | {ok:false, reason}`, and actions return `{blocked, reason}` rendered inline.
- Suspense appears exactly 3× — twice for `useSearchParams` compliance, once around `<ServiceUsage>`.
- **Toast-through-redirect**: server actions can't call a client toast, so they `redirect("?connected=…")` and `ToastFromParams` converts then strips the param.
- Two form flavours, both documented in-file: real `<form action={serverAction}>` on auth pages, imperative calls inside Radix dialogs (Radix unmounts a nested `<form>` on Action click).

### Styling

Dark-only. `app/globals.css` (231 lines) is Tailwind v4 CSS-first. The load-bearing part is lines 6-20:
five `@custom-variant` declarations mapping shadcn's `data-open`/`data-closed`/`data-active` shorthand
onto Radix's real `data-state` attributes — needed because `shadcn init` writes
`@import "shadcn/tailwind.css"` and **that package ships no CSS at all**. Without them ~63 rules
silently compile to nothing while typecheck and build stay green.

Design rules are enforced at token level: `--shadow-*: none` and `--font-weight-semibold/bold: 500`,
so the utilities still compile but emit nothing. `--shadow-md`/`--shadow-lg` are deliberately kept for
floating overlays only — a documented deviation from DESIGN.md.

### Connect sheet (`connect-sheet.tsx`, 527 LOC — biggest component)

Five tabs: `framework | server | direct | orm | mcp`. Panels are **mounted on first visit then only
hidden** (`visited: Set`), so opening the sheet fetches nothing on its own. Framework content is
*functions of the project keys*, not static strings — snippets are generated with the real URL/key
baked in and rendered through Shiki server-side (`lib/highlight.ts` is `server-only` so the WASM
never ships).

10 frameworks live (Next.js, React Router, React, Nuxt, Vue, SvelteKit, Solid, Astro, Refine,
TanStack Start), 6 disabled as "soon". 2 ORMs (Prisma, Drizzle).

## Layer 4 — Data model (`supabase/schema.sql`, 197 LOC)

Single idempotent file, pasted into the SQL editor; doubles as the migration path. RLS on all four
tables, `revoke all from anon` on each.

| Table | Purpose | Policy |
|---|---|---|
| `connections` | One row per connected org. Unique index on `(user_id, kind, coalesce(sb_account_id, org_slug))` | `for all`, `user_id = auth.uid()` |
| `connection_events` | Append-only audit. `connection_id` deliberately **not** a FK so events survive deletion | split `select` + `insert`, no update/delete — an attacker with the session cannot erase their tracks |
| `vault` | Master-password metadata only (`salt`, `iterations`, `check_blob`). No key material | `for all`, own row |
| `connection_secrets` | Client-encrypted `vault_blob` | `for all`, own row |

One function, no triggers: `delete_own_account()` — `security definer`, `search_path = ''`, granted
only to `authenticated`. Chosen over putting a `service_role` key in the app for one delete button.

## Environment (7 vars)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `ENCRYPTION_KEY`, `SB_OAUTH_CLIENT_ID`,
`SB_OAUTH_CLIENT_SECRET`, `CONNECT_MODES`.

`SITE_URL` is never derived from request headers — deliberate, documented as an attacker-influence
vector. `DATABASE_URL` / `VITE_SUPABASE_*` / `REACT_APP_*` appearing in grep are **snippet templates**
in `lib/framework-content/`, not app config.

## Test coverage

`node --conditions=react-server --test lib/**/*.test.ts`. 9 files, 60 tests, ~470 LOC. No framework —
`node:test` + `node:assert/strict`. Imports use explicit `.ts` extensions because Node's type
stripping requires them; that same constraint shaped how `MgmtError` declares its `status` field.

**Tested** (the pure/parseable core): `crypto`, `vault-crypto`, `mgmt-api` (fetch monkeypatch),
`safe`, `logs-sql`, `prometheus`, `safe-path`, `tags`, `framework-content`.

**Untested** (everything doing I/O): `connections.ts` including the whole refresh path, `oauth.ts`,
`inventory.ts`, `db-introspect.ts`, `audit.ts`, `vault-store.ts`, and all `*-actions.ts`.

## Project history

14 commits, 2026-08-24 → 2026-08-26, all by `dris1153`, conventional commits. Branch `dev` (ahead of
`main`, which receives PRs from `dev`).

Arc: single-operator inventory board → multi-user custodial app → second Supabase dashboard.

Five plan folders, timestamped `YYMMDD-HHmm-slug`. Only the first has `plan.md` + phase files; the
rest are brainstorm-report-only, implemented directly.

1. **multi-user-auth-and-oauth-connections** — Phase 1 ✅, Phase 2 shipped, Phase 3 in-progress. The 369-line brainstorm report is the richest doc in the repo: a live OAuth capability spike, a real bug found and fixed (`getHealth` sending a rejected `timeout_ms`), and the finding that classic user-scoped PATs can no longer be created.
2. **shadcn-ui-migration** — includes a postmortem of the silent `shadcn/tailwind.css` failure, and a dated addendum that deliberately breaks DESIGN.md's no-shadow rule for floating overlays only.
3. **owner-and-tags** — `text[]` + GIN index over a join table; caught the `write()` clobber trap.
4. **credential-vault** — reframed as "this is a password manager"; hybrid architecture decision.
5. **project-workspace** — measured API feasibility; GitHub tile dropped as impossible (no Management API endpoint).

## Known gaps & findings

**Flagged by scouting agents, worth verifying before acting on:**

1. `lib/connections.ts:244` — `connectionId: existing?.id` is `undefined` on the insert branch (the insert doesn't `.select()` the id back), so the **first `connected` audit event for any connection is recorded with `connection_id = null`**.
2. `lib/vault-actions.ts:41-47` — `rotateVault`'s comment claims "one call so a half-rotated vault cannot exist", but the implementation is a sequential loop of independent updates with no transaction. Since meta (salt/iterations) is updated **first**, a mid-loop failure leaves un-rotated blobs undecryptable.
3. `proxy.ts:55` — the matcher regex lives in a plain string, so `\.` collapses to `.` and matches any character there rather than a literal dot. Benign but real.
4. `proxy.ts` MFA check adds a second Supabase round-trip on essentially every non-static request, on top of `getUser()`. The Next 16 proxy docs explicitly warn against slow data fetching there.
5. `components/ui/dropdown-menu.tsx` (269 LOC) and `ui/input-group.tsx` have no importers outside `components/ui/` — vendored but unused.
6. `lib/vault-store.ts:30` — dead `void store;`.

**Documented as not built** (per README + plan Phase 3):

- 11 of 13 project nav items
- KEK into a KMS — blocked pending an AWS/GCP decision (Vercel has none)
- Zero-downtime `ENCRYPTION_KEY` rotation — the `v1.` prefix exists to make it addable; runbook budgets half a day. **Rotating it today destroys access to every stored token.**
- MFA recovery codes — **cannot** be built; Supabase Auth has none and a homemade code can't mint an `aal2` JWT
- CAPTCHA, rate-limit review, background sync, UI-driven master-password rotation

## Orientation notes for future work

- Every non-trivial file carries a "why, not what" header comment explaining a Supabase API constraint, a Radix behaviour, or a deliberate DESIGN.md deviation. **Read the header before changing a file** — the comments are unusually dense and reliable.
- `AGENTS.md` is auto-generated by `next dev`, not project docs. `CLAUDE.md` is a 12-byte `@AGENTS.md` include.
- `DESIGN.md` is a style reference *extracted from supabase.com's landing page*, not a hand-authored spec — which is why the shadcn plan documents where the app deviates (dashboard density, not landing-page density).
- The two `scripts/*.mjs` are development aids: `oauth-spike.mjs` runs the OAuth flow once locally (writes tokens to a `0600` file rather than printing them); `probe-token.mjs` prints a per-endpoint capability table for diffing PAT vs OAuth.
- PAT is measurably *more* capable than OAuth (disk util and api-keys both work), which is why the UI presents the two as equals rather than burying PAT under "Advanced".

## Unresolved questions

- `plan.md` front-matter in plan 1 says `status: pending` while its phase files say `completed` — the plan overview has drifted from reality and needs reconciling.
- The credential-vault brainstorm proposes a `'google'` login method and a `provider_email` column; shipped `schema.sql` explicitly removes both. The report is stale relative to the schema.
- Whether rotating `SB_OAUTH_CLIENT_SECRET` invalidates issued refresh tokens is **undocumented by Supabase** and flagged Unverified in the runbook — untested.
