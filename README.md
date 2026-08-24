# SuperDB

Every Supabase project, across every one of your Supabase accounts, on one board.

Each account contributes a personal access token. SuperDB reads the account's identity from the
token itself (`GET /v1/profile` → `primary_email`), so every project row already knows which email
owns it — nothing to label by hand.

## Setup

**1. A Supabase project to hold SuperDB's own data**

Create one (or reuse one), open the SQL editor, and run [`supabase/schema.sql`](supabase/schema.sql).
It creates `public.supabase_accounts` with row level security on.

**2. Your login**

In that project: *Authentication → Sign In / Providers* → turn **off** "Allow new users to sign up".
Then *Authentication → Users → Add user* and create your own account.

**3. Environment**

```bash
cp .env.example .env.local
npm run genkey        # paste the output into ENCRYPTION_KEY
```

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Project settings → API |
| `SUPABASE_ANON_KEY` | Project settings → API (anon / publishable key) |
| `ENCRYPTION_KEY` | `npm run genkey` — **back this up**, tokens are unreadable without it |
| `ALLOWED_EMAIL` | Your email. Any other address is rejected before Supabase Auth is called. |

**4. Run**

```bash
npm install
npm run dev
```

**5. Connect accounts**

Go to **Accounts**, paste a token from
`supabase.com/dashboard/account/tokens` for each Supabase account you own.

## How tokens are protected

A personal access token has full control over a Supabase account, so it sits behind two independent
locks:

- **Encrypted at rest** — AES-256-GCM before it reaches the database. A database leak alone yields
  nothing; the key lives only in the server environment.
- **Row level security** — a row is readable only by the authenticated user who created it.

They never reach the browser: `listAccounts()` selects an explicit column list that excludes the
ciphertext, and only server code ever calls `decrypt()`. All Management API calls are made
server-side.

## Deploy

Works on Vercel as-is. Set the four environment variables in the project settings and add your
deployment URL to *Authentication → URL Configuration* in the Supabase project.

## Stack

Next.js 16 (App Router, server components) · Supabase Auth + Postgres · Tailwind v4 · Tabler Icons.
No ORM, no data-fetching library, no component library — the whole app is ~900 lines.

Theme follows `DESIGN.md` for palette and typography, but uses the Supabase *dashboard's* density
(6px radius, compact tables) rather than the landing page's pill buttons and 64px section gaps.

## Not built yet

Free-form SQL runner · pause / restore / restart actions · security & performance advisors ·
background sync with cached history · TOTP two-factor on login. Each is a small addition on top of
`lib/mgmt-api.ts`.
