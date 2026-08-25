-- Run this in the SQL editor of the Supabase project that backs SuperDB itself.
-- Safe to re-run: every statement is guarded.

create table if not exists public.connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('pat', 'oauth')),

  -- PAT connections know the account; OAuth connections only ever know the organization, because
  -- GET /v1/profile answers "does not support oauth access yet" and no scope changes that.
  sb_account_id  text,                        -- gotrue_id from GET /v1/profile
  email          text,
  org_slug       text,
  org_name       text,
  label          text,                        -- optional nickname, e.g. "work", "client A"

  -- Envelope encryption: one data key per connection, wrapped by ENCRYPTION_KEY. Access and refresh
  -- tokens live together in a single sealed JSON object so they share that one data key.
  dek_wrapped    text not null,
  secret_cipher  text not null,               -- sealed {"access": "...", "refresh": "..." | null}
  expires_at     timestamptz,                 -- OAuth only
  token_hint     text not null,               -- last 4 chars, to tell connections apart in the UI

  created_at     timestamptz not null default now(),
  synced_at      timestamptz,
  last_error     text                         -- set when a refresh fails; drives the Reconnect state
);

-- One row per account (PAT) or per organization (OAuth). coalesce needs an index, not a constraint.
create unique index if not exists connections_identity
  on public.connections (user_id, kind, coalesce(sb_account_id, org_slug));

alter table public.connections enable row level security;

drop policy if exists "own connections" on public.connections;
create policy "own connections" on public.connections
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.connections from anon;

-- ---------------------------------------------------------------------------
-- Upgrading from the single-user schema: run this only after reconnecting your
-- accounts through the UI. The old table stored tokens under a different
-- encryption scheme, so its rows cannot be migrated in place.
--
--   drop table if exists public.supabase_accounts;
-- ---------------------------------------------------------------------------
