# SuperDB

Every Supabase project, across every one of your Supabase accounts, on one board.

Each account contributes a personal access token. SuperDB reads the account's identity from the
token itself (`GET /v1/profile` → `primary_email`), so every project row already knows which email
owns it — nothing to label by hand.

## Setup

**1. A Supabase project to hold SuperDB's own data**

Create one (or reuse one), open the SQL editor, and run [`supabase/schema.sql`](supabase/schema.sql).
It creates `public.supabase_accounts` with row level security on.

**2. Authentication**

Signup is open — anyone can register. In the same project:

- *Authentication → Sign In / Providers* → allow new users to sign up.
- **GitHub provider**: create a GitHub OAuth App with callback
  `https://<project-ref>.supabase.co/auth/v1/callback`, then paste its client ID and secret in.
- **SMTP** (*Authentication → SMTP Settings*): a real provider such as Resend or Postmark, with a
  verified sending domain. The built-in mailer is capped at a few messages per hour and is not meant
  for production. DNS verification is the slow part — start it first.
- **Email templates** — required, not optional. Change *Confirm signup* and *Reset password* to:

  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
  ```

  The stock `{{ .ConfirmationURL }}` does not work with this flow and fails silently.
- *Authentication → URL Configuration*: set Site URL, and add `<origin>/**` to the redirect allowlist.
  A bare origin or a single `*` will not match `/auth/callback` — Supabase treats `/` as a separator,
  so the globstar is required. Use the exact path instead of a globstar in production.
- *Authentication → Attack Protection*: leaked-password protection needs a Pro plan; skip it on Free.

Accounts with the same email are merged automatically — a person who signs up with GitHub and later
with email/password ends up as one user. That is Supabase's default and needs no configuration. One
consequence: signing up with an address that already has a GitHub identity returns success and sends
no email, by design, to prevent account enumeration.

**3. Environment**

```bash
cp .env.example .env.local
npm run genkey        # paste the output into ENCRYPTION_KEY
```

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Project settings → API |
| `SUPABASE_ANON_KEY` | Project settings → API (anon / publishable key) |
| `SITE_URL` | This app's own origin, no trailing slash. `http://localhost:3000` in development. |
| `ENCRYPTION_KEY` | `npm run genkey` — **back this up**, tokens are unreadable without it |

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
