---
phase: 3
title: "Topbar breadcrumb"
status: in-progress  # code done; the rename check needs the app
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Topbar breadcrumb

## Overview

The project name and the way back to the board, which the rail no longer has room for.

## Requirements

- A bar across the top of every project route: a link to the board, then the project name.
- It carries the app-level navigation the sidebar stopped showing in phase 2 — Connections, and the
  account settings and sign-out that live at the bottom of `components/sidebar.tsx`.
- It replaces the header in `project-nav.tsx:61-72`, which goes away with the rail.
- No project switcher — settled in the plan.

**The app nav has to land somewhere.** Phase 2 stands the app sidebar down and leaves only an
"All projects" row in the rail as the way out. This is where Connections and the account menu come
back, and until it ships the board is the only route to them.

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

## What landed

- `components/project-topbar.tsx` — Projects / project name, then Connections and Account.
- `app/(app)/p/[ref]/layout.tsx` — a column: topbar, then the row of rail and content.
- `components/project-nav.tsx` — the "All projects" row hands its job to the topbar and goes.

**The account menu was measured out of existence.** A `DropdownMenu` grouping Connections, Account
and Sign out put Radix's menu into the first load of *every* project route:  went
653,916 to 707,399 bytes — **52KB to group two links and a button**. Plain links instead, and
sign-out keeps its place in the app sidebar, one click away on the board. An action taken once a
session does not earn 52KB on every page of it.

With the dropdown gone the topbar has no state, so it is not a client component either. Every project
route ends up **smaller than before this phase**: tables 896,809 to 896,369, settings 654,528 to
653,916 — the rail gave back its link and the bar ships no JavaScript.

**Two breadcrumb levels, not three.** Supabase has an organization and a branch between the logo and
the project. This app models neither, and inventing the segments would imply features that do not
exist.

## Success Criteria

- [x] The breadcrumb names the project and links to the board on all five project routes.
- [ ] **Needs the app.** A rename updates it without a reload — with a warm memo, since a cold one
      hides the defect.
- [ ] **Needs the app.** No page is taller than the viewport. This is the change phase 1 was
      separated for, so it is the check that matters most.
- [x] Connections is reachable from inside a project again.
- [x] `pnpm test` still green — 410.

## Risk Assessment

**Height, again.** This phase is the reason phase 1 exists; if phase 1 was done carelessly, this is
where it shows.

**A breadcrumb that lies after a rename.** Three caches hold a project name and only one of them is
obvious. The mechanism exists and is documented; this phase's job is to confirm it still works from a
second surface rather than to rebuild it.
