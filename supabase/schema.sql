-- Run this once in the SQL editor of the Supabase project that backs SuperDB itself.

create table if not exists public.supabase_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gotrue_id     text not null,               -- Supabase account id from GET /v1/profile
  email         text not null,               -- primary_email, resolved from the token
  username      text,
  label         text,                        -- optional nickname, e.g. "work", "client A"
  token_cipher  text not null,               -- PAT, AES-256-GCM. Useless without ENCRYPTION_KEY.
  token_hint    text not null,               -- last 4 chars, for telling tokens apart in the UI
  created_at    timestamptz not null default now(),
  synced_at     timestamptz,
  unique (user_id, gotrue_id)
);

alter table public.supabase_accounts enable row level security;

-- Single policy for all verbs: a row is only ever visible to the user who added it.
create policy "own accounts" on public.supabase_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.supabase_accounts from anon;
