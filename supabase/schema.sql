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
  last_error     text,                        -- set when a refresh fails; drives the Reconnect state

  -- The user's chosen order, for the connections table and the board. Deliberately nullable rather
  -- than `not null default 0`: a row inserted by older code between running this file and deploying
  -- would take 0 and jump to the top of the board, the most visible wrong place. Null sorts last
  -- instead, which is where a new connection belongs anyway. Readers order nulls last and tiebreak
  -- on created_at, so the order stays total even with nulls or duplicates.
  sort_order     integer
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

-- Converge an existing database on sort_order, seeding it from the order rows were connected in so
-- nothing visibly moves the first time this runs.
alter table public.connections add column if not exists sort_order integer;

-- Only rows that have none, so re-running this file never renumbers an order somebody chose.
--
-- The numbering continues past that user's current maximum instead of restarting at 1. WHERE is
-- applied before the window function, so row_number() counts only the unnumbered rows — without the
-- offset, a row added after the first run would be numbered 1 and land second, not last, which is
-- exactly the placement the column comment above promises to avoid.
update public.connections c
   set sort_order = ranked.rn
  from (
    select n.id,
           coalesce(
             (select max(m.sort_order) from public.connections m where m.user_id = n.user_id),
             0
           ) + row_number() over (partition by n.user_id order by n.created_at) as rn
      from public.connections n
     where n.sort_order is null
  ) ranked
 where c.id = ranked.id and c.sort_order is null;

-- No unique constraint on (user_id, sort_order): rewriting a whole ordering necessarily passes
-- through states where two rows share a number, and a constraint would reject the legitimate write.
create index if not exists connections_order on public.connections (user_id, sort_order);

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
  event         text not null check (event in ('connected', 'refreshed', 'refresh_failed',
                                             'disconnected', 'wrote')),
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

-- ---------------------------------------------------------------------------
-- The board's project order. Projects live in Supabase, not here — they arrive from the Management
-- API on every load — so there is no row to add a column to and this table keys on the ref instead.
--
-- Deliberately empty until the first drag, which sends the whole visible order and seeds every row
-- at once. Do not add a backfill: there is nothing to back-fill from, and the one above for
-- connections is where an ordering bug shipped.
--
-- A project deleted in Supabase leaves a row here that never matches again. That is intended. A
-- cleanup would have to treat a ref missing from one API response as gone for good, and a failed
-- call looks exactly the same.
-- ---------------------------------------------------------------------------

create table if not exists public.project_order (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_ref  text not null,
  sort_order   integer not null,
  updated_at   timestamptz not null default now(),

  -- Composite key, so it doubles as the on conflict target below. No surrogate id earns its place.
  primary key (user_id, project_ref)
);

alter table public.project_order enable row level security;

drop policy if exists "own project order" on public.project_order;
create policy "own project order" on public.project_order
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.project_order from anon;

-- Converge an existing table: 'wrote' records a change made to a user's own database through the
-- table editor. The constraint is unnamed in the CREATE above, so Postgres called it this.
alter table public.connection_events
  drop constraint if exists connection_events_event_check;
alter table public.connection_events
  add constraint connection_events_event_check
  check (event in ('connected', 'refreshed', 'refresh_failed', 'disconnected', 'wrote'));

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

-- Reordering. One statement, so a partial reorder cannot exist — the app already has one non-atomic
-- update loop (rotateVault) and does not need a second.
--
-- security invoker, unlike delete_own_account above: the "own connections" policy already scopes
-- this correctly, and definer would only widen what a bug here could reach. The user_id clause is
-- belt and braces alongside that policy.
--
-- array_position returns null for an id that is not in the array, and `id = any(ids)` keeps those
-- rows out of the update — so a stale list from the browser cannot blank an untouched connection.
create or replace function public.reorder_connections(ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.connections c
     set sort_order = array_position(ids, c.id)
   where c.user_id = auth.uid() and c.id = any(ids);
$$;

revoke all on function public.reorder_connections(uuid[]) from public, anon;
grant execute on function public.reorder_connections(uuid[]) to authenticated;

-- The same job for projects, except rows may not exist yet: the first drag inserts the whole board.
-- `with ordinality` supplies each ref's position, so no index arithmetic crosses the wire, and the
-- insert and the update are one statement rather than a read followed by a write.
--
-- Clearing the order is a plain delete from the app; the policy above already scopes it, so it needs
-- no function of its own.
create or replace function public.reorder_projects(refs text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.project_order (user_id, project_ref, sort_order)
  select auth.uid(), r.ref, r.ord
    from unnest(refs) with ordinality as r(ref, ord)
  on conflict (user_id, project_ref) do update
    set sort_order = excluded.sort_order, updated_at = now();
$$;

revoke all on function public.reorder_projects(text[]) from public, anon;
grant execute on function public.reorder_projects(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Upgrading from the single-user schema: run this only after reconnecting your
-- accounts through the UI. The old table stored tokens under a different
-- encryption scheme, so its rows cannot be migrated in place.
--
--   drop table if exists public.supabase_accounts;
-- ---------------------------------------------------------------------------
