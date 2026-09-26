---
phase: 2
title: "The icon rail"
status: in-progress  # code done; the keyboard and touch checks need the app
priority: P1
effort: "3h"
dependencies: []
---

# Phase 2: The icon rail

## Overview

Inside a project there is one rail, and it belongs to the project: `components/project-nav.tsx` becomes
a 48px column of icons, and `components/sidebar.tsx` stops rendering there.

## What phase 1 turned up, and why this phase changed

`components/sidebar.tsx:26` already reads:

> Inside a project the project panel needs the horizontal space, so this drops to icons only — global
> navigation stays reachable rather than being replaced.

So `/p/` routes are **already** rail + panel + content, and the rail is the *app* nav. Shrinking the
project nav on top of that would have given two 48px icon columns side by side — 96px of unlabelled
icons — and taken every project navigation label off the screen.

The screenshot has a single rail because Supabase has no app rail on that page: its global chrome
lives in the topbar. So the app sidebar stands down inside a project, and the rail becomes the project
nav.

**The rail keeps a way out.** A "All projects" row at the top, as `project-nav.tsx:62-69` has today,
because this phase can land before the topbar exists and must not strand anyone inside a project.
Connections and account settings are reachable from the board until phase 3 puts them in the topbar.

## Requirements

- 48px wide, icons only, tooltip on the right carrying the row's label.
- Greyed rows keep their treatment and say "soon" in the tooltip.
- Every row is reachable and named by keyboard, not only by mouse.
- No collapsed state, nothing remembered.

## The two ways this fails silently

**Radix ignores pointer events on a disabled element.** A tooltip wrapped around a greyed row simply
never opens — no error, no warning, and the row is the one that most needs explaining. It needs a
focusable wrapper, or the row needs to stop being a bare `<span>`.

**At 48px the tooltip is the only thing naming a row.** Radix opens a tooltip on focus as well as
hover, but only for an element that actually takes focus. Today's greyed rows are
`<span aria-disabled>` (`project-nav.tsx:83-93`), which never receives it — so a keyboard user would
tab past an unlabelled icon with no way to learn what it is. A `<button disabled>` is not enough
either: disabled buttons are removed from the tab order. The row needs to stay focusable and be
marked unavailable, not be made unreachable.

## Architecture

The row list stays exactly as it is — `SECTIONS` in `project-nav.tsx`, with the `ready` flag and the
prefix-matching active test that the settings work added. Only the rendering changes.

**No `useSidebarCollapsed`.** That hook is the table editor sidebar's, and this rail has no collapsed
state to remember. Sharing it would couple two sidebars that are deliberately different.

The active row keeps its `text-primary` icon; with no label beside it, that colour and the background
are the only thing marking position, so both stay.

## Related Code Files

- Modify: `components/project-nav.tsx`, `components/sidebar.tsx` (stand down inside `/p/`)
- Read for context: `components/ui/tooltip.tsx`, `components/table-editor/sidebar.tsx` for the idiom
  this deliberately does not reuse

## Implementation Steps

1. The app sidebar stops rendering inside `/p/`; the `railed` branch goes with it.
2. The rail: 48px, icons, tooltips, active state, and the "All projects" row at the top.
3. Make greyed rows focusable and named, then tab through the whole rail with the mouse untouched.
4. Check a touch viewport: the rail must still be usable when hover does not exist — tapping an icon
   navigates, which is the whole interaction.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## What landed

- `components/project-nav.tsx` — 48px, icons, tooltips on the right, an "All projects" row at the top,
  and the prefix-matching active test kept from the settings work.
- `components/sidebar.tsx` — returns null inside `/p/`, and the `railed` branch it no longer needs is
  gone rather than left switched off. Its `Tooltip` import went with it.

**Greyed rows are `aria-disabled` buttons, not disabled ones.** A disabled button leaves the tab order,
and at this width the tooltip is the only thing naming a row — so a keyboard user would pass an
unlabelled icon with no way to learn what it is. Radix also ignores pointer events on a truly disabled
element, which would leave the tooltip silently never opening. Both failures are invisible in a diff.

/p/[ref]/tables 897,258 to 896,809 bytes; the other project routes move by about the same.

## Success Criteria

- [x] Exactly one rail inside a project, and it is the project's.
- [x] The board is still reachable from every project route — the "All projects" row, kept precisely
      because this phase can land before the topbar does.
- [x] The rail is 48px and every enabled row navigates.
- [ ] **Needs the app.** Tabbing reaches every row, greyed ones included, and each one's name appears
      on focus.
- [ ] **Needs the app.** A greyed row's tooltip actually opens — by keyboard, which is the path that
      silently does nothing.
- [x] The active row is distinguishable without a label: background plus a `text-primary` icon.
- [x] `pnpm test` still green — 410, and none of them cover this.

## Risk Assessment

**A rail of unlabelled icons is unusable if the tooltips fail**, and they fail quietly. That is the
whole risk of this phase; everything else is layout.

**Reading an icon wrongly costs a navigation, not data.** Worth stating because it bounds how careful
to be: the icons are the existing ones, already shipped beside their labels, so this is a recognition
problem rather than a new vocabulary.
