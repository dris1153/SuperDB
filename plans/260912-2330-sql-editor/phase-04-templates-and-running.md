---
phase: 4
title: "Templates and running queries"
status: pending
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

## Success Criteria

- [ ] Every template runs successfully against a real project — checked individually, not assumed.
- [ ] Clicking a template does not discard unsaved work silently.
- [ ] Running queries lists real sessions and excludes its own backend.
- [ ] No termination control exists, and its absence does not read as a bug.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` green.

## Risk Assessment

**Templates that do not work.** Their whole value is being known-good. Any written from memory rather
than run are worse than absent — this is the phase where that temptation is strongest.

**Running queries reading as actionable.** A list of long-running statements invites wanting to stop
them. The absence of a kill button needs to look deliberate.

**`pg_stat_activity` permissions.** The read-only role may see limited columns for other users'
sessions — `query` in particular can come back null or redacted. Check what actually returns rather
than assuming full visibility, and render the limited case rather than empty cells.
