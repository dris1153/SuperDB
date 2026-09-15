---
phase: 3
title: "Topbar breadcrumb"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Topbar breadcrumb

## Overview

The project name and the way back to the board, which the rail no longer has room for.

## Requirements

- A bar across the top of every project route: a link to the board, then the project name.
- It replaces the header in `project-nav.tsx:61-72`, which goes away with the rail.
- No project switcher — settled in the plan.

## Architecture

The bar lives in `app/(app)/p/[ref]/layout.tsx`, above the row that holds the rail and the content, so
the rail starts below it. `resolveProject` already runs there for the 404 and hands over the name, so
this costs nothing new.

**Depends on phase 1 for a reason.** Adding this bar to pages that still declare `h-screen` makes
every one of them 40px taller than the viewport. Phase 1 is what makes this a layout change rather
than a scroll bug.

**The name can be stale for up to a minute.** `renameProject` mutates the `owners` memo in place and
revalidates this layout with `type: "layout"` precisely so the rename shows here — that mechanism was
built in the database-password plan and this phase is its second consumer. Worth re-checking rather
than assuming: a rename should still update the breadcrumb with no reload.

## Related Code Files

- Modify: `app/(app)/p/[ref]/layout.tsx`, `components/project-nav.tsx` (drop its header)
- Create: `components/project-topbar.tsx`
- Read for context: `lib/project-actions.ts` for what a rename invalidates

## Implementation Steps

1. The topbar, fed from the layout's existing `resolveProject`.
2. Drop the rail's header.
3. Rename a project and watch the breadcrumb — with a warm memo, since a cold one hides the defect.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Success Criteria

- [ ] The breadcrumb names the project and links to the board on all five project routes.
- [ ] A rename updates it without a reload.
- [ ] No page is taller than the viewport — the check phase 1 established, repeated here because this
      is the change that would break it.
- [ ] `pnpm test` still green — 410.

## Risk Assessment

**Height, again.** This phase is the reason phase 1 exists; if phase 1 was done carelessly, this is
where it shows.

**A breadcrumb that lies after a rename.** Three caches hold a project name and only one of them is
obvious. The mechanism exists and is documented; this phase's job is to confirm it still works from a
second surface rather than to rebuild it.
