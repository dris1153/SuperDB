---
type: scout-report
date: 2026-09-10
scope: whole project
branch: dev
head: 5f0f14b
supersedes: 260829-2148-whole-project-architecture-scout.md
---

# Scout Report — SuperDB, whole project

Refresh of the 2026-08-29 scout (head `7ca1726`), which predates the entire table editor. That
report's architecture sections still hold; this one re-measures scale, adds the table-editor layers,
and marks which of its findings survived.

## Summary

**SuperDB is a multi-account Supabase dashboard.** It aggregates every project across every Supabase
account a user owns onto one board, then offers a per-project workspace mirroring the Supabase
dashboard — Overview, Database, and now a full read/write **Table Editor**.

- **19,414 LOC** across `app/` `lib/` `components/` (was ~7,400 at the last scout — the table editor
  roughly tripled the codebase).
- 207 files. Only **12 exceed 200 LOC**, and 5 of those are vendored shadcn or test files.
- Health at scout time: `pnpm test` **253/253 pass**, `pnpm typecheck` clean.
- Stack: Next.js 16.3.2 (App Router, `proxy.ts`) · React 19.2 · Tailwind v4 CSS-first · shadcn/ui
  (`radix-nova`) on the unified `radix-ui` package · Supabase Auth + Postgres · Supabase Management
  API · react-data-grid 7 beta · Shiki. **No ORM, no data-fetching library, no test framework**
  (`node:test`).

### Two Supabase relationships, never confuse them

1. **SuperDB's own project** — users, connections, audit events, vault metadata. RLS-scoped,
   reached via `@supabase/ssr` (`lib/supabase/server.ts`).
2. **The user's projects** — reached over HTTPS through the Management API (`lib/mgmt-api.ts`) with
   a PAT or OAuth token. **Nothing uses `pg` directly.**

```
Browser ─┬─ proxy.ts (Next 16 middleware) ── getUser() + aal2 MFA gate
         ├─ app/(app)/**   Server Components, force-dynamic, all fetching
         │     └─ inline "use server" actions passed as props → client leaves
         ├─ components/**  78 "use client" leaves (Radix, clipboard, IndexedDB, WebCrypto)
         └─ lib/**         server-only domain logic
```

## Layer 1 — Routing & auth (`app/`, `proxy.ts`)

19 route files: 14 pages/layouts, 5 route handlers. **Every page is a Server Component**; zero
`"use client"` in `app/`. No `error.tsx` / `loading.tsx` / `not-found.tsx` anywhere — failures are
handled as *data* (`lib/safe.ts::attempt()` returns `{ok,data} | {ok:false,reason}`).

| URL | File | Notes |
|---|---|---|
| `/` | `app/(app)/page.tsx` | Projects board, `loadInventory()` fan-out |
| `/connections` | `app/(app)/connections/page.tsx` | PAT + OAuth connect; 3 inline server actions |
| `/settings` | `app/(app)/settings/page.tsx` | MFA, vault, event log, delete account |
| `/p/[ref]` | `app/(app)/p/[ref]/page.tsx` | Overview, 8-way `Promise.all` |
| `/p/[ref]/database` | `app/(app)/p/[ref]/database/page.tsx` | Health, disk, tables, RLS badges |
| `/p/[ref]/tables` | `app/(app)/p/[ref]/tables/page.tsx` | **Table editor** — the big one |
| `/login` `/signup` `/forgot-password` `/reset-password` `/mfa` | `app/*/page.tsx` | Outside `(app)`, no sidebar |
| `/auth/{callback,confirm,signout}` | route handlers | SuperDB's own login |
| `/api/connect/{start,callback}` | route handlers | OAuth against a Supabase *organization* |

- **`proxy.ts` is Next 16's renamed `middleware.ts`.** Exports `proxy()` + `config.matcher`. Gate
  order: `getUser()` (not `getSession()`) → public allowlist → signed-out-only bounce → `aal1→aal2`
  redirect to `/mfa`. `/reset-password` is deliberately *not* public.
- **Two OAuth flows.** `app/auth/*` = user signs into SuperDB (`@supabase/ssr`). `app/api/connect/*`
  = SuperDB authorizes against a Supabase org (hand-rolled `lib/oauth.ts`, PKCE S256, form-encoded
  token body, HTTP Basic client creds, no `scope` param). Both are auth-gated by the proxy.
- Next 16 APIs in use: `await params` / `await searchParams`, `await cookies()`, `proxy.ts`,
  `allowImportingTsExtensions`. **Not** used: `cacheComponents`, `"use cache"`, `cacheLife/cacheTag`.
- `resolveProject()` is wrapped in React `cache()` — layout and page both call it and each call fans
  out one API request per connection.
- `next.config.ts` carries only security headers (`X-Frame-Options: DENY`, `nosniff`, `no-referrer`).

## Layer 2 — Domain logic (`lib/`, 80 files)

### Connections (`lib/connections.ts`, 300 LOC — the hub)

A **connection** = one credential granting access to one Supabase organization. `kind` is
`pat | oauth`, gated per-deployment by `CONNECT_MODES`.

- `SAFE_COLUMNS` allowlist never selects `dek_wrapped`/`secret_cipher` → the type is safe to hand to
  a client component.
- Refresh is **proactive** at `expires_at − 5min`. Failure writes `last_error` and throws
  `Reconnect required` — no retry loop, because failure means upstream revocation.
- `write()` is select-then-update-or-insert (not upsert) so `display_name`/`tags` are insert-only —
  re-authorizing never clobbers user-chosen names.
- Identity comes from `listOrgs()[0]`, not `/v1/profile` — Supabase no longer issues user-scoped
  tokens, so `/v1/profile` is unreachable forever.

### Management API (`lib/mgmt-api.ts`)

One `call<T>()` helper, `Bearer`, `cache: "no-store"`, identical for PAT and OAuth. ~17 endpoints.
Three hard-won behaviours, each with a regression test: error bodies capped at **2000** chars,
empty-body 200s handled (`POST /restore`), `queryLogs` inspects the envelope (Logflare answers 200
with `error` populated for bad SQL).

Two query endpoints matter downstream:

| Endpoint | Role | Used for |
|---|---|---|
| `/database/query/read-only` | `supabase_read_only_user` (`rolbypassrls`) | all reads, `previewAffected` |
| `/database/query` | **`postgres`** — full DDL, RLS bypassed | all writes and DDL |

Neither supports bind parameters. Every statement is a text string — which is why the SQL layer
below is built the way it is.

### Two independent encryption schemes

| | Tokens | Account passwords |
|---|---|---|
| Module | `lib/crypto.ts` (`server-only`) | `lib/vault-crypto.ts` (browser-only) |
| Scheme | AES-256-GCM envelope, DEK per secret wrapped by `ENCRYPTION_KEY` | PBKDF2-HMAC-SHA256 @ 600k iters → non-extractable AES-GCM key |
| Key lives | env var (the var *is* the key, no KDF) | derived in browser, IndexedDB, 8h expiry |
| Server can read? | **Yes** — must, for unattended OAuth refresh | **No** — zero-knowledge by construction |
| Format | `iv.tag.ciphertext` (3 parts) | `iv.ciphertext` (2 parts, GCM tag appended) |

`lib/crypto.ts` is candid that envelope encryption buys no extra secrecy while the master key sits
in an env var; it exists so rotation is a rewrap of short DEKs and a KMS move is a one-function
change. Real protection: a stolen DB dump, not a compromised server.

### SQL / DDL / write engine (added since last scout)

Read chain for a page of rows:

```
p/[ref]/tables/page.tsx → inventory.resolveProject → table-editor.{listSchemas,listTablesIn,describeTable}
                        → table-view.parseSort + table-filter.parseFilters
                        → table-rows.rowCount (reltuples veto, exact ≤50k)
                        → table-rows.selectRows → components/table-editor/workspace.tsx
```

**Safety model** (documented at length in `docs/table-editor.md`):

- Identifiers → `sql-ident.quoteIdent` (interior `"` doubled). Literals → `quoteLiteral` (throws on
  NUL). LIMIT/OFFSET → `clampInt`.
- **Values never appear as SQL values.** `sql-write.jsonLiteral` encodes the whole payload as one
  dollar-quoted JSON literal with a random tag *verified absent* from the encoding, unpacked by
  `jsonb_to_record` / `jsonb_to_recordset` using catalog types.
- Layered guards: `checkKnown` (column must exist in catalog), `rejectGenerated`, `rejectTruncated`,
  `checkName` (63 **bytes**), `checkType` (allowlist read from `pg_type` per request).
- **Nothing the browser composes is sent.** The client imports the same pure builders only to render
  a preview; `ddl-actions.run` and `write-actions.run` rebuild the statement server-side.
- `write-actions.run` **re-checks the confirmed row count** immediately before the write and refuses
  if it moved — that is what makes "no write without a confirmed preview" a property of the layer,
  not of the UI.
- Display truncation happens in SQL (`left(x::text, 512) || '…'`); truncated values are refused as
  both payloads and keys.
- `auth`/`storage` schemas require typing the table name (`isGuardedSchema`).

**State model** — URL is the single source of truth for *what data* is shown:
`sort=id.asc,name.desc` · `filter=column.op.value` · `q` (built as `strpos(lower(col::text), needle)`,
not `ilike`, so `%`/`_` stay literal) · page/size (`[100, 500]`). `orderClause` always appends the PK
as a tiebreak, because LIMIT/OFFSET without ORDER BY is unstable.

### Observability & audit

- `prometheus.ts` — hand-rolled exposition-format parser; `memoryUsedPercent` uses
  `MemTotal − MemAvailable`, not `MemFree`.
- `logs-sql.ts` — one `union all` over six log sources with three different severity vocabularies,
  joined into a single query specifically to stay under the rate limit. Gap-fills buckets.
- `audit.ts` — `recordEvent`, **never throws** ("a lost log line is bad, a connect that fails because
  logging failed is worse"). Events: `connected | refreshed | refresh_failed | disconnected | wrote`.
- `write-audit.ts` — deliberately **not** a `"use server"` module, so the browser cannot call it with
  arbitrary text. Records failed writes too.

## Layer 3 — UI (`components/`, 94 files)

- 78 `"use client"` files. Pages fetch; client components are interactive leaves.
- Server actions are defined **inline in the page** and passed as props; exceptions are on-demand RPC
  modules (`connect-`, `framework-`, `orm-`, `vault-`, `mfa-`, `table-`, `write-`, `ddl-actions`).
- **No `useActionState` / `useOptimistic` / `useFormStatus`** — consistently `useTransition`.
- **Toast-through-redirect**: server actions `redirect("?connected=…")`, `ToastFromParams` converts
  then strips the param.
- Three context providers total: `VaultProvider`, `TooltipProvider`, `TableUrlProvider`.

### Table editor UI (`components/table-editor/`, 44 files)

Three distinct state layers, deliberately separated:

| Layer | Holds | Mechanism |
|---|---|---|
| URL | what data is shown | `url.tsx` `TableUrlProvider`, one shared `useTransition` |
| sessionStorage | how it's shown | `session-store.ts` on `useSyncExternalStore`; `column-prefs.ts`, tabs, density |
| React state | ephemeral overlays | expanded row, editing column, pending cell, selection |

`grid.tsx` is the only `react-data-grid` consumer — `rowKeyGetter` is `JSON.stringify(pk values)`
(JSON to avoid composite-key collisions), selection disabled entirely when there is no PK, sorting
always round-trips to the server. Every mutation funnels through `write-confirm.tsx` (rows) or
`ddl-confirm.tsx` (schema). **No optimistic UI** — every write round-trips and `router.refresh()`s.

### Styling

Dark-only. `app/globals.css` (251 lines), Tailwind v4 CSS-first. Load-bearing: five
`@custom-variant` declarations mapping shadcn's `data-open`/`data-closed`/`data-active` shorthand
onto Radix's real `data-state` — needed because `shadcn init` writes `@import "shadcn/tailwind.css"`
and **that package ships no CSS at all**. Without them ~63 rules silently compile to nothing while
typecheck and build stay green.

Design rules enforced at token level: `--shadow-*: none` and `--font-weight-semibold/bold: 500`, so
the utilities compile but emit nothing. `--shadow-md`/`-lg` kept for floating overlays only — a
documented deviation from `DESIGN.md`. Four icon libraries: Tabler (app-wide), Lucide
(`components/ui/*` only), `developer-icons` (framework logos), `country-flag-icons` (regions).

### Connect sheet (`connect-sheet.tsx`, 531 LOC — biggest hand-written file)

Five tabs (`framework | server | direct | orm | mcp`); panels mount on first visit then only hide, so
opening the sheet fetches nothing on its own. Framework content is *functions of the project keys* —
snippets generated with the real URL/key baked in, rendered through Shiki server-side
(`lib/highlight.ts` is `server-only` so the WASM never ships). 10 frameworks live, 6 disabled as
"soon"; 2 ORMs (Prisma, Drizzle).

## Layer 4 — Data model (`supabase/schema.sql`, 206 LOC)

Single idempotent file pasted into the SQL editor; doubles as the migration path. RLS on all four
tables, `revoke all from anon` on each.

| Table | Purpose | Policy |
|---|---|---|
| `connections` | one row per connected org; unique index on `(user_id, kind, coalesce(sb_account_id, org_slug))`; GIN on `tags` | `for all`, `user_id = auth.uid()` |
| `connection_events` | append-only audit; `connection_id` deliberately **not** a FK so events outlive the connection | split `select` + `insert`, **no update/delete** — a compromised session cannot erase its tracks |
| `vault` | master-password metadata only (`salt`, `iterations`, `check_blob`) | own row |
| `connection_secrets` | client-encrypted `vault_blob` + plaintext login method/email | own row |

One function: `delete_own_account()` — `security definer`, `search_path = ''`, granted only to
`authenticated`. Chosen over putting a `service_role` key in the app for one delete button.

## Environment (7 vars)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `ENCRYPTION_KEY`, `SB_OAUTH_CLIENT_ID`,
`SB_OAUTH_CLIENT_SECRET`, `CONNECT_MODES`.

`SITE_URL` is never derived from request headers — deliberate, documented as an attacker-influence
vector. `DATABASE_URL` / `VITE_SUPABASE_*` / `REACT_APP_*` appearing in grep are **snippet templates**
in `lib/framework-content/`, not app config.

## Test coverage

`node --conditions=react-server --test lib/**/*.test.ts` — **18 files, 253 tests**, no framework.
Imports use explicit `.ts` extensions because Node's type stripping requires them.

**Tested** (the pure core): `crypto`, `vault-crypto`, `mgmt-api`, `safe`, `safe-path`, `prometheus`,
`logs-sql`, `tags`, `framework-content`, `sql-ident`, `sql-write`, `ddl-statements`, `cell-value`,
`csv-parse`, `csv-import`, `table-export`, `table-filter`, `table-view`.

**Untested** (everything doing I/O): `connections.ts` including the whole refresh path, `oauth.ts`,
`inventory.ts`, `db-introspect.ts`, `audit.ts`, `write-audit.ts`, `vault-store.ts`, `table-rows.ts`,
`table-writes.ts`, `table-ddl.ts`, `ddl-types.ts`, and all `*-actions.ts`. The table-editor I/O path
is verified instead by live-database probing recorded in `docs/table-editor-measurements.md`.

## Project history

26 commits, 2026-08-24 → present, all by `dris1153`, conventional commits, branch `dev`.
Arc: single-operator inventory board → multi-user custodial app → second Supabase dashboard →
**working table editor**.

8 plan folders (`YYMMDD-HHmm-slug`). The three table-editor plans are the only ones with full
`plan.md` + phase files and `status: completed`; the rest are brainstorm-report-only, implemented
directly. `plans/reports/` holds cross-plan reports.

## Findings

### Still present (re-verified at head `5f0f14b`)

1. **`lib/connections.ts:243`** — `connectionId: existing?.id` is `undefined` on the insert branch
   (the insert doesn't `.select()` the id back), so the **first `connected` audit event for any
   connection is recorded with `connection_id = null`**.
2. **`lib/vault-actions.ts` `rotateVault`** — the comment claims "one call so a half-rotated vault
   cannot exist", but the implementation updates vault meta **first**, then loops independent
   per-connection updates with no transaction. A mid-loop failure leaves un-rotated blobs
   undecryptable.
3. **`proxy.ts:55`** — the matcher regex lives in a plain string, so `\.` collapses to `.` and
   matches any character rather than a literal dot. Benign but real.
4. ~~**`proxy.ts` MFA check** adds a second Supabase round-trip on essentially every non-static
   request.~~ **Retracted 2026-09-10** — inherited from the 2026-08-29 scout and never verified.
   `getAuthenticatorAssuranceLevel()` only calls `getUser()` inside an `if (jwt)` branch
   (`GoTrueClient.js:5013`); `proxy.ts` passed no argument, so it read the cookie instead. The proxy
   made one round trip, not two. It still holds that the Next 16 proxy docs warn against data
   fetching there, and that its one `getUser()` is a floor on time-to-first-paint.
5. **`components/ui/input-group.tsx`** — vendored, still zero importers outside `components/ui/`.
6. **`lib/vault-store.ts:30`** — dead `void store;`.
7. **`ColumnDefault { kind: "raw" }`** (`lib/ddl-build.ts:defaultClause`) is interpolated verbatim
   and the server does not re-verify that the caller used the SQL-labelled field. No privilege
   escalation — the caller already holds a PAT and the write endpoint runs as `postgres` — but it is
   the one unguarded grammar path in an otherwise thoroughly defended layer.
8. **`lib/db-introspect.ts:35`** interpolates the `HIDDEN` array with hand-rolled `'${s}'` instead of
   `quoteLiteral`. Safe (module constants) but inconsistent.
9. **Server actions accept unvalidated `schema` strings** — quoted, but not checked against
   `listSchemas()`. Inert; lets a caller target any existing schema.
10. **`saveConnectionSecret` has no size cap** on `vault_blob`; the column is unbounded `text`.

### Resolved since the last scout

- `components/ui/dropdown-menu.tsx` now has importers (`table-editor/column-menu.tsx`,
  `table-editor/table-menu.tsx`) — no longer dead.

### Documentation drift (worth fixing)

- **`README.md` is stale on three counts**: it claims "around 7,400 lines" (now 19,414), lists
  **Table Editor under "Not built yet"** when three plans shipped it, and says "eleven of thirteen"
  nav items are disabled when `project-nav.tsx` now marks three ready (Overview, Table Editor,
  Database) and ten "soon". It also advertises `pnpm test` as "33 tests"; it is 253.
- **`plans/260824-1218-.../plan.md`** front-matter still says `status: pending` while its phase files
  say completed. Flagged at the last scout, unchanged.
- The credential-vault brainstorm proposes a `'google'` login method and a `provider_email` column;
  shipped `schema.sql` explicitly removes both. Report is stale relative to the schema.

## Orientation notes

- **Every non-trivial file carries a "why, not what" header comment** explaining a Supabase API
  constraint, a Radix behaviour, or a deliberate `DESIGN.md` deviation. Read the header before
  changing a file — the comments are unusually dense and reliable.
- `docs/table-editor.md` and `docs/table-editor-measurements.md` are the two documents to read before
  touching the write path. The measurements file records facts established against a live project;
  several are counter-intuitive enough that the code implementing them looks wrong without them.
- `AGENTS.md` is auto-generated by `next dev`, not project docs. `CLAUDE.md` is a 12-byte
  `@AGENTS.md` include.
- `DESIGN.md` is a style reference *extracted from supabase.com's landing page*, not a hand-authored
  spec — which is why the app deliberately uses dashboard density instead.
- PAT is measurably *more* capable than OAuth (disk util and api-keys both work), which is why the UI
  presents the two as equals rather than burying PAT under "Advanced".

## Unresolved questions

- Whether rotating `SB_OAUTH_CLIENT_SECRET` invalidates issued refresh tokens is **undocumented by
  Supabase** and flagged Unverified in `docs/secret-rotation-runbook.md` — still untested.
- `ENCRYPTION_KEY` remains a single point of total loss: no KMS, no rewrap script in `lib/`. Rotating
  it today destroys access to every stored token.
- Whether the remaining ten nav slugs are still the intended roadmap, given the table editor took the
  codebase from 7.4k to 19.4k lines on its own.
