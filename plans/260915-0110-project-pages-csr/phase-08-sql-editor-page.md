---
phase: 8
title: "SQL editor page"
status: completed
priority: P3
effort: "2h"
dependencies: [3]
---

# Phase 8: SQL editor page

## Overview

`/p/[ref]/sql` moves its one server read to the client. The smallest phase here: the page is already
a shell.

## Requirements

- The editor, tabs and sidebar frame paint without waiting on the saved-query list.
- An unreadable list still says so rather than claiming nothing is saved.
- Running statements keeps going through the existing server action.

## Architecture

The page awaits exactly two things today: `resolveProject` for the 404 and the title, and
`savedQueries(ref)` for the sidebar. Only the second moves — one part, `saved-queries`.

**`runSql` does not move.** It is a server action with a read-only-first flow, a confirm that names
the project, and an audit trail; it is not a read and has no place in a query cache. The same goes
for the saved-query mutations, which already return the fresh list — that return value becomes the
query's new data rather than a separate refetch.

**The null-versus-empty distinction survives.** `page.tsx` passes `null` when the list could not be
read, and the sidebar says "Saved queries could not be read" rather than "Nothing saved for this
project yet" — which is what an unapplied schema looks like. The query's error state has to keep that
apart from an empty array.

## Related Code Files

- Modify: `app/(app)/p/[ref]/sql/page.tsx`, `components/sql-editor/workspace.tsx`,
  `components/sql-editor/use-saved-queries.ts`
- Extend: `lib/project-parts.ts` with `saved-queries`
- Read for context: `lib/saved-queries.ts`, `lib/sql-editor-actions.ts`

## Implementation Steps

1. The `saved-queries` part.
2. The sidebar on the query, with a skeleton.
3. Mutations write their returned list into the cache instead of refetching.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Review findings, and what came of them

The list arriving *after* the tabs do is the whole of this phase's difficulty, and every finding was
some consumer reading that window as an answer.

- **A `""` reason fell through to "Nothing saved for this project yet."** — the exact false claim
  this phase forbids, reached whenever a refusal carried no text. `reasonOf` never returns the empty
  string now: callers branch on its truthiness, so a falsy reason reads as "no reason", which is how
  "could not be read" turns into "nothing here".
- **A failed background refetch threw away a good list.** `useProjectPart` checked `error` before
  `data`, and TanStack keeps the previous answer in the cache alongside the error — so one blink of
  the network replaced a list that was still on screen with "could not be read". Data is checked
  first.
- **The loading window read as "this query was deleted" in three places at once.** `dirtyTabs`
  compared every restored tab against nothing and marked it unsaved; the tab bar labelled it
  "Unlinked query"; and the toolbar offered **"Save as…"** on a tab that *is* linked — which writes a
  second row holding the same query, the one thing `onSave` exists to prevent. `listed` threads
  through the pure function, the label and the Save button, and the case is pinned by a test.
- **A write could be undone by a refetch that was already in flight.** `useSetPart` did not cancel
  first, and `setQueryData` refreshes `dataUpdatedAt` — so with a 60s stale time and no refetch on
  focus, nothing would have corrected it. The star you had just clicked would quietly un-star itself.
- **A stale list stayed stale after saying so.** "That query no longer exists" and "already gone"
  both mean the caller's copy is out of date; reporting them without re-reading leaves the dead row
  on screen, where the next click fails the same way. Those two reasons invalidate the part.
- **This app's own Postgres error text reached the browser.** Every other reader's reason comes from
  the user's project and is theirs to act on; `relation "public.saved_queries" does not exist` is a
  deployment detail of *this* app. The reader turns it into one stable sentence.
- `create` went through the shared `act` rather than duplicating it, and `act` now awaits the cache
  write before its callback, so the callback sees the list it was given.

## Success Criteria

- [x] The editor is usable before the saved list arrives: the page awaits `resolveProject` only, and
      the sidebar shows a skeleton while the part is read.
- [x] An unreadable list says so **and says why**; an empty one says something different; and the
      window in between now says neither.
- [x] Save, rename, delete and favourite still work, and the list updates from the mutation's own
      return value rather than a refetch — cancelling any in-flight read first.
- [x] `runSql` and its confirm are untouched: the diff does not enter `use-run-sql.ts`.
- [ ] **Needs the app.** The frame painting before the sidebar, a restored tab keeping its name and
      its Save button through the fetch, and the three sidebar states under a throttled network.
- [x] `/p/[ref]/sql` first load 777,375 → 791,960 bytes.

## Risk Assessment

**Low, and that is why it is last.** The only trap is collapsing "could not read" into "empty", which
is exactly the bug this page already fixed once.
