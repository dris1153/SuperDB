---
phase: 2
title: "The icon rail"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 2: The icon rail

## Overview

`components/project-nav.tsx` goes from a 240px column of labelled rows to a 48px column of icons, each
named by a tooltip.

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

- Modify: `components/project-nav.tsx`
- Read for context: `components/ui/tooltip.tsx`, `components/table-editor/sidebar.tsx` for the idiom
  this deliberately does not reuse

## Implementation Steps

1. The rail: 48px, icons, tooltips, active state.
2. Make greyed rows focusable and named, then tab through the whole rail with the mouse untouched.
3. Check a touch viewport: the rail must still be usable when hover does not exist — tapping an icon
   navigates, which is the whole interaction.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Success Criteria

- [ ] The rail is 48px and every enabled row navigates.
- [ ] Tabbing reaches every row, greyed ones included, and each one's name appears on focus.
- [ ] A greyed row's tooltip actually opens — checked by keyboard, since that is the path that
      silently does nothing.
- [ ] The active row is distinguishable without a label.
- [ ] `pnpm test` still green — 410, and none of them cover this.

## Risk Assessment

**A rail of unlabelled icons is unusable if the tooltips fail**, and they fail quietly. That is the
whole risk of this phase; everything else is layout.

**Reading an icon wrongly costs a navigation, not data.** Worth stating because it bounds how careful
to be: the icons are the existing ones, already shipped beside their labels, so this is a recognition
problem rather than a new vocabulary.
