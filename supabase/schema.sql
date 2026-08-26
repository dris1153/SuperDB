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
  org_name       text,                        -- mirrors Supabase; follows renames upstream

  -- User-owned, never overwritten by a reconnect. Seeded from org_name on first connect.
  display_name   text not null default 'unnamed',
  tags           text[] not null default '{}',

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


-- Converge an existing database on the shape above. Backfill runs before `label` is dropped, so a
-- nickname someone already set survives as their first tag.
alter table public.connections add column if not exists display_name text;
alter table public.connections add column if not exists tags text[] not null default '{}';

update public.connections
   set display_name = coalesce(display_name, email, org_name, org_slug, 'unnamed')
 where display_name is null;

-- Dynamic SQL because Postgres parses the whole statement before evaluating any guard: referencing
-- `label` directly would fail on a fresh install where the column never existed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'connections' and column_name = 'label'
  ) then
    execute $inner$
      update public.connections set tags = array[label]
       where tags = '{}' and label is not null
    $inner$;
  end if;
end $$;

alter table public.connections alter column display_name set not null;
alter table public.connections alter column display_name set default 'unnamed';
alter table public.connections drop column if exists label;

-- After the column exists, never before: on an existing database the create table above is a no-op,
-- so indexing tags any earlier fails with "column tags does not exist".
create index if not exists connections_tags on public.connections using gin (tags);

alter table public.connections enable row level security;

drop policy if exists "own connections" on public.connections;
create policy "own connections" on public.connections
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.connections from anon;

-- Forensic trail for credential handling. Written on connect / refresh / revoke / disconnect only —
-- not on reads, which would drown the useful rows.
create table if not exists public.connection_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id uuid,                        -- deliberately not a foreign key: the row must survive
                                             -- the connection being deleted, which is the event
                                             -- most worth keeping
  owner         text,                        -- organization name at the time of the event
  kind          text,
  event         text not null check (event in ('connected', 'refreshed', 'refresh_failed', 'disconnected')),
  detail        text,
  ip            text,
  created_at    timestamptz not null default now()
);

create index if not exists connection_events_user_time
  on public.connection_events (user_id, created_at desc);

alter table public.connection_events enable row level security;

-- Append-only from the app's point of view: a user may read and write their own rows but never
-- update or delete them, so an attacker with the user's session cannot erase their own tracks.
drop policy if exists "own events readable" on public.connection_events;
create policy "own events readable" on public.connection_events
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own events appendable" on public.connection_events;
create policy "own events appendable" on public.connection_events
  for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.connection_events from anon;

-- ---------------------------------------------------------------------------
-- Credential vault. Everything here is written by the browser and is opaque to this database and to
-- the server: the key is derived from a master password that never leaves the client. The server
-- cannot validate, search or recover any of it, by design.
-- ---------------------------------------------------------------------------

create table if not exists public.vault (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kdf         text not null default 'PBKDF2-SHA256',
  iterations  int  not null,
  salt        text not null,             -- base64url; a salt is not secret
  check_blob  text not null,             -- AES-GCM over a known constant, to detect a wrong password
  created_at  timestamptz not null default now()
);

alter table public.vault enable row level security;

drop policy if exists "own vault" on public.vault;
create policy "own vault" on public.vault
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.vault from anon;

create table if not exists public.connection_secrets (
  connection_id         uuid primary key references public.connections (id) on delete cascade,
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Identity stays readable: it is what answers "whose account is this org", and it is not a secret.
  -- Methods match the Supabase dashboard sign-in page: GitHub, ChatGPT, SSO, or email + password.
  -- There is no Google option there, despite the habit of assuming one.
  supabase_login_method text check (supabase_login_method in ('email', 'github', 'chatgpt', 'sso')),
  supabase_email        text,

  -- Client-encrypted {"supabase_password": "...", "email_password": "..."}. One blob rather than a
  -- column per password: a single IV, and adding a field later is a JSON change, not a migration.
  vault_blob            text,
  updated_at            timestamptz not null default now()
);

alter table public.connection_secrets enable row level security;

drop policy if exists "own connection secrets" on public.connection_secrets;
create policy "own connection secrets" on public.connection_secrets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.connection_secrets from anon;

-- Converge an existing table: provider_email is gone (every method now has exactly one email) and
-- google was never a Supabase sign-in option to begin with.
alter table public.connection_secrets drop column if exists provider_email;
alter table public.connection_secrets
  drop constraint if exists connection_secrets_supabase_login_method_check;
alter table public.connection_secrets
  add constraint connection_secrets_supabase_login_method_check
  check (supabase_login_method in ('email', 'github', 'chatgpt', 'sso'));

-- Account deletion. Removing a row from auth.users normally needs the service_role key, which
-- bypasses RLS everywhere — far too much reach to add to the app just for this. A security definer
-- function scoped to auth.uid() does the same job and can delete nobody else.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Upgrading from the single-user schema: run this only after reconnecting your
-- accounts through the UI. The old table stored tokens under a different
-- encryption scheme, so its rows cannot be migrated in place.
--
--   drop table if exists public.supabase_accounts;
-- ---------------------------------------------------------------------------
