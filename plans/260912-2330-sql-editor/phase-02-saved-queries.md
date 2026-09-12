---
phase: 2
title: "Saved queries"
status: pending
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 2: Saved queries

## Overview

The left sidebar: save a query, name it, find it again. FAVORITES and PRIVATE sections with a search
box — the original minus the section that has no meaning here.

## Requirements

**Functional**
- Save the editor's contents under a name; reopen it later.
- Rename, delete, mark as favourite.
- Search by name.
- Queries are scoped to one project.

**Non-functional**
- RLS scopes every path to the caller.
- SHARED is omitted, not rendered empty.

## Architecture

A per-project table keyed by ref — the third this session after `project_order` and
`project_secrets`, for the same reason: the project lives in Supabase, not here.

```sql
create table if not exists public.saved_queries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_ref  text not null,
  name         text not null,
  sql          text not null,
  favorite     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

A surrogate id here, unlike the other two per-project tables: a query is renameable, and a name is
not a key. Index on `(user_id, project_ref, updated_at desc)` for the sidebar's ordering.

**Why SHARED is omitted rather than rendered empty.** Every user sees only their own connections;
there is no multi-person organisation in this app. An empty SHARED section would imply sharing exists
and is merely unused, which is a different and wrong claim. FAVORITES and PRIVATE cover everything
that can be true here.

**Search is client-side.** The list is small and already loaded, so a round trip per keystroke would
be worse for no gain — the same reasoning as the connections table's filters.

## Related Code Files

- Modify: `supabase/schema.sql`
- Create: `lib/saved-queries.ts` — read helper plus the actions; a sidebar component
- Modify: the phase 1 route, to host the sidebar
- Read for context: `lib/project-secrets.ts` as the precedent for a per-ref table's actions

## Implementation Steps

1. Table, RLS, index, revoke from `anon`.
2. Read helper and actions: create, rename, delete, toggle favourite. Cap the name and SQL lengths.
3. Sidebar: sections, search, and the empty state for a project with nothing saved.
4. Wire save from the toolbar, and clicking a saved query into the editor.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
6. Verify under impersonation that a second user cannot read or write the first's rows.

## Success Criteria

- [ ] Saving, reopening, renaming, deleting and favouriting all work and survive a reload.
- [ ] Queries are scoped per project — the same name in two projects does not collide.
- [ ] A second user cannot see or modify them, verified by impersonating two accounts.
- [ ] Search filters by name with no round trip.
- [ ] No SHARED section is rendered.
- [ ] `supabase/schema.sql` run twice in a row is a no-op the second time.

## Risk Assessment

**Unsaved work lost on navigation.** The sidebar invites clicking away from an unsaved buffer. Phase 3
owns the buffer model; until then, confirm before replacing dirty editor contents.

**No length caps.** An unbounded `text` column plus an action that does not check is how a table grows
unnoticed — already flagged once on `saveConnectionSecret`.

**Name collisions.** Two queries may share a name; the id is the key. Do not add a unique constraint
to simplify the UI, or renaming becomes a failure case for no reason.
