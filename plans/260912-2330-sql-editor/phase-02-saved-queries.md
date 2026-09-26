---
phase: 2
title: "Saved queries"
status: in-progress
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

**As built this carries three check constraints, added by separate `alter table` statements** —
name length, sql length, and the ref's shape. `create table if not exists` adds nothing to a table
that already exists, so constraints written inline here would never reach a database created from
this snippet. See `supabase/schema.sql`, which uses the drop-if-exists/add idiom it already uses for
`connection_events_event_check`.

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

## What was built, where it differs from the plan

- **Update in place was added.** The plan listed save, rename, delete and favourite. Without an
  update, opening a saved query, editing it and pressing Save left a second row with the same name —
  so `Save` writes back to the open query and `Save as…` is what creates one. Renaming and re-saving
  the statement are the same `updateSavedQuery` call: both mean "this query changed".
- **Every mutation answers with the whole list.** Small list, server-ordered by `updated_at`; a patch
  applied locally would have to re-derive that ordering and could disagree with it. No optimistic
  state, so nothing to roll back — `use-optimistic-order.ts` exists because that reconciliation is
  where the bugs were.
- **Length caps are check constraints, not only TypeScript.** The browser holds a session and the
  anon key, so an insert can reach this table without passing through the action. A cap that lives
  only in the action is not a cap.
- `createSavedQuery` returns the new id alongside the list: the client has to know which row it just
  created, and picking "the newest" or matching on name would be a guess.
- The editor is remounted by `key` to load a query, rather than gaining an imperative handle for
  replacing its document. A remount also answers what happens to the undo history — it starts a new
  one, which is what opening a different query means.
- `name-dialog.tsx` is mounted per question instead of kept mounted with `open=false`, which is how
  the field starts from the right name without an effect resetting state — the lint rule against
  setting state in an effect is the same one that came up in the connections work.
- The toolbar came out as its own file: `workspace.tsx` was 209 lines with it inline.

## Review findings, and what came of them

Reviewed 2026-09-13. Cross-user and cross-project access verified closed: `for all to authenticated`
with `using` and `with check` on `user_id = auth.uid()`, `user_id not null` so it cannot be dodged by
omission, `auth.uid()` null for `anon`, and `revoke all from anon` over the top. The server-only
split holds — four callables reach the browser, all mutations. Fixed:

- **A save that stored nothing reported success.** PostgREST answers a 0-row `update` or `delete`
  happily, so saving a query another tab had deleted resolved cleanly and the user got no signal.
  Both now `.select("id")` and treat an empty result as an error that says to save it as a new one.
- **The check constraints never converged.** `create table if not exists` leaves an existing table
  alone, and this plan's own DDL snippet above had no constraints — so the caps would have lived only
  in TypeScript on exactly the databases most likely to be in use. Three `alter table` statements now
  drop and re-add them, and the snippet says so.
- **`project_ref` is now shape-checked** (`~ '^[a-z]{20}$'`). An arbitrary ref stores a row nothing
  will ever match again, which `lib/project-order.ts` already documents as a trap. `project_order`
  and `project_secrets` predate this and go without.
- **Overlapping mutations could land out of order.** Each action answers with the list as it stood
  after its own write, so starring two queries quickly could leave one rendered wrong until reload.
  The star and the row menu are disabled while a mutation is in flight.
- **The list read is bounded to 200.** It ships every statement's full text, and a statement may be
  100 kB — unbounded, a hundred saved queries would be ~10 MB on first paint and again after every
  star click.
- **Failures come back as values, not thrown.** React replaces a rejected action's message with a
  digest in production, which would have made the new "that query no longer exists" message unreadable
  — the one message on this path worth reading. Same shape as `runSql`'s `RunResult`.
- **`dirty` no longer ignores whitespace.** A buffer holding only spaces was an edit the discard
  prompt did not ask about.
- **A stale error no longer leaks into the next dialog.** The message is shared with them, so it is
  cleared when a mutation starts rather than only when one succeeds.
- **An unreadable list says so.** It was rendering "Nothing saved for this project yet.", which is
  what an unapplied schema would show — a false claim rather than a missing table.

Accepted without change, and why:

- **No bound on how many rows one user may insert.** RLS bounds whose rows, not how many, and the
  browser holds the anon key — so an app-level cap would not be a bound at all, and a real one means
  a count trigger. The two cheap halves are taken (the length caps, the list limit). Revisit if
  signup on the SuperDB project itself is open to the public.
- **The saved statement is stored as written, including any password literal.** The audit trail
  redacts, because it is append-only and nobody reads it deliberately; a saved query that came back
  redacted would be corrupt.
- **Saved-query writes are not project-authorised** the way `runSql` is: `isProjectRef` checks the
  shape, not ownership. A user can only create rows against a ref of their own, and the gain would
  be a Management API fan-out on every star click — on a branch whose whole purpose is latency.
- **Leaving the page still drops an unsaved buffer.** The discard prompt covers replacing the buffer
  within the page, which is what this phase set out to do.

## Success Criteria

- [ ] **Needs the app.** Saving, reopening, renaming, deleting and favouriting all work and survive
      a reload.
- [ ] **Needs the app.** Queries are scoped per project — the same name in two projects does not
      collide.
- [ ] **Needs two accounts.** A second user cannot see or modify them, verified by impersonation.
- [x] Search filters by name with no round trip — client-side filter over the loaded list.
- [x] No SHARED section is rendered, and the omission is documented where the sections are built.
- [x] `supabase/schema.sql` is idempotent by construction: `create table if not exists`,
      `drop policy if exists` before `create policy`, `create index if not exists`. Running it is
      still the account owner's step.
- [x] `pnpm test` (316), `pnpm typecheck`, `pnpm lint`, `pnpm build` green. The route's first load
      grew from 685KB to 733KB with the sidebar and its dialogs; `/p/[ref]/tables` is 851KB.

## Risk Assessment

**Unsaved work lost on navigation.** The sidebar invites clicking away from an unsaved buffer. Phase 3
owns the buffer model; until then, confirm before replacing dirty editor contents.

**No length caps.** An unbounded `text` column plus an action that does not check is how a table grows
unnoticed — already flagged once on `saveConnectionSecret`.

**Name collisions.** Two queries may share a name; the id is the key. Do not add a unique constraint
to simplify the UI, or renaming becomes a failure case for no reason.
