---
phase: 4
title: "Templates and running queries"
status: in-progress
priority: P3
effort: "4h"
dependencies: [1]
---

# Phase 4: Templates and running queries

## Overview

The sidebar's REFERENCE section — Templates and Examples — plus the "View running queries" control at
the bottom.

The cheapest phase, and independent of 2 and 3.

## Requirements

**Functional**
- Templates and Examples list ready-made statements; clicking one loads it into the editor.
- "View running queries" shows what is currently executing against the project.

**Non-functional**
- Templates are static content in the repo, not a database table.
- The running-queries view is read-only and offers no way to kill a session.

## Architecture

**Templates and Examples are a module, not a table.** They do not vary per user or per project, so a
table would be a migration for content that belongs in source control. Same reasoning as
`lib/framework-content/`, which holds the Connect sheet's snippets as code.

Keep them honest: a template that does not run is worse than no template. Prefer statements this repo
already relies on — the catalog queries in `lib/table-editor.ts` and `lib/db-introspect.ts` were
measured against live projects and make good examples.

**Running queries** is one `pg_stat_activity` select through `readOnlyQuery`:

```sql
select pid, usename, state, wait_event_type, query_start, left(query, 200) as query
  from pg_stat_activity
 where datname = current_database() and pid <> pg_backend_pid()
 order by query_start
```

`left(query, 200)` because a long statement makes the table unreadable and the full text is rarely
what is wanted at a glance. `pid <> pg_backend_pid()` so the list does not include the query asking
the question.

**No termination.** `pg_terminate_backend` is deliberately absent. Killing a session from a dashboard
this small, with no confirmation model built for it, is a foot-gun with no matching benefit.
Supabase's own UI offers it; this is a considered omission, not an oversight, and the UI should not
look like the button failed to load.

## Related Code Files

- Create: a templates module, a running-queries component
- Modify: the phase 1 route, to host the REFERENCE section and the control
- Read for context: `lib/framework-content/index.ts` for how static content is structured here

## Implementation Steps

1. The templates module: a handful that genuinely work, not a long list.
2. The sidebar REFERENCE section; clicking loads into the editor.
3. The running-queries query and its view.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
5. Run every template against a real project, one by one.

## What was built, where it differs from the plan

- **Templates and Examples are split by what they do.** Examples are read-only questions about the
  project as it is; Templates write, carry placeholders, and are marked "Edit the placeholders, then
  run". The editor's confirm still names the project before any write.
- **`lib/running-queries.ts` holds only the statement and its row type, with no imports.** The probe
  imports it so it runs the real query rather than a copy, and plain Node cannot resolve this repo's
  extensionless imports. The `readOnlyQuery` call lives in the action.
- **Clicking a snippet opens it in its own tab.** Phase 4 was written before tabs existed and asked
  for a confirm before replacing unsaved work; with tabs there is nothing to replace.
- **Idle sessions are excluded from the running list.** `query` holds the *last* statement a session
  ran, so an idle connection's `delete from users` would otherwise sit under a heading saying it is
  running. Ordered active first and newest first, so a pooler's old idle-in-transaction sessions
  cannot fill the limit and hide what is executing.
- **`query` and `usename` can be null** — what the read-only role may see of another session is
  limited. Measured here it could see both, but that depends on the project's roles, so the limited
  case renders as "not visible" rather than as an empty cell that would claim there is no query.

## What the probe proves, and what it does not

This is a correction. The first version of this phase claimed every template had been verified,
because each came back with SQLSTATE 25006 from the read-only endpoint. **That claim was wrong**, and
measuring 2026-09-13 settled exactly how wrong:

| Sent to the read-only endpoint | Answer |
|---|---|
| `creat table …` (typo) | 42601 |
| `create table x (id uuid default no_such_function())` | 25006 |
| `alter table <no such table> add column x text` | 25006 |
| `create index on <no such table> (x)` | 25006 |
| `create policy p on <no such table> …` | **42P01** |

So 25006 does prove a statement **parses** — a syntax error is still reported inside a read-only
transaction. It proves nothing about the objects named: the refusal is by command tag, before names
are resolved. Substituting a real table therefore adds verification for exactly one template,
`create policy`, which resolves its relation and would have answered 42P01.

Verifying the other four would mean writing to a real database. That is not something to do to
someone's project to tick a criterion, so the claim is now the accurate one and the statements are
kept short enough to check by reading.

The examples are a different matter: 201 with rows is a real execution.

## The snippets the review caught

Three said something false or more dangerous than they admitted:

- **`create index concurrently`** cannot run inside a transaction block, and statements reach this
  endpoint inside one — so it would have been refused *after* the user confirmed the write, and a
  failed concurrent build leaves an invalid index behind that still costs every write. The
  `concurrently` is gone and the description now says the build takes a lock, and to use psql for a
  large table.
- **The policy template did not enable RLS.** A policy on a table with RLS off is inert: the table
  stays readable by anyone the schema is exposed to, under a title promising each user sees only
  their own rows. It now enables RLS first.
- **"Indexes nothing reads" listed unique indexes.** Enforcing uniqueness on insert does not count
  as a scan, so a primary key on an insert-only table always looks unused — and dropping one loses
  the constraint, not just the index. Unique indexes are excluded.

Smaller ones, same pass: the RLS list missed partitioned parents and buried its answer under
Supabase's own schemas; `reltuples` shows null rather than `-1` where a relation has never been
analysed; the policy list gained `permissive`, without which "what each policy allows" reads the
wrong way for a RESTRICTIVE policy; three examples gained the `LIMIT` the others had; `pg_policies`
is schema-qualified like everything else here; a dead `PLACEHOLDERS` export is gone.

And in the panel: the action can reject before its own try block, which left it on "Reading…" for
ever with nothing to catch the rejection — `resolveProject` moved inside the try and the client
catches too. It is now mounted only while open, so closing discards the rows instead of showing a
list from minutes ago on reopen, and the timestamp column says UTC.

## Success Criteria

- [x] Every **example** runs successfully against a real project — checked individually by
      `scripts/probe-sql-templates.mjs`, all 7 answering 201 with rows.
- [~] Every **template** parses and is classified as a write, checked the same way. Not the same as
      "runs": see the correction above. Verifying further means writing to a real database.
- [x] Clicking a template does not discard unsaved work: it opens a new tab.
- [x] Running queries lists real sessions and excludes its own backend (`pid <> pg_backend_pid()`),
      and background workers (`backend_type = 'client backend'`) — counting those inflates the number
      by roughly eight, as `db-introspect.ts` already records.
- [x] No termination control exists, and the panel says so in its footnote — a missing button reads
      as one that failed to load.
- [x] `pnpm test` (332), `pnpm typecheck`, `pnpm lint`, `pnpm build` green.
- [ ] **Needs the app.** The REFERENCE section expands, a snippet opens in a tab, and the running
      queries dialog renders what the probe saw.

## Risk Assessment

**Templates that do not work.** Their whole value is being known-good. Any written from memory rather
than run are worse than absent — this is the phase where that temptation is strongest.

**Running queries reading as actionable.** A list of long-running statements invites wanting to stop
them. The absence of a kill button needs to look deliberate.

**`pg_stat_activity` permissions.** The read-only role may see limited columns for other users'
sessions — `query` in particular can come back null or redacted. Check what actually returns rather
than assuming full visibility, and render the limited case rather than empty cells.
