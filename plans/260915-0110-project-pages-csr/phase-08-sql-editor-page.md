---
phase: 8
title: "SQL editor page"
status: pending
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

## Success Criteria

- [ ] The editor is usable before the saved list arrives.
- [ ] An unreadable list says so; an empty one says something different.
- [ ] Save, rename, delete and favourite still work, and the list updates without a refetch.
- [ ] `runSql` and its confirm are untouched.

## Risk Assessment

**Low, and that is why it is last.** The only trap is collapsing "could not read" into "empty", which
is exactly the bug this page already fixed once.
