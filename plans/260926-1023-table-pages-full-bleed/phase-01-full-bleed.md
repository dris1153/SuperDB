---
phase: 1
title: "Full-bleed Users"
status: in-progress  # built; not looked at in a browser
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Full-bleed Users

## Overview

Take the Users page out of its container and give it the shape the Table Editor already has.

## Requirements

- The table runs to both edges of the content area.
- The horizontal scrollbar sits at the bottom of the window, not under the table.
- Title only — no subtitle.
- The toolbar is its own strip with a rule under it.
- Total and paging pin to the bottom as a status bar.
- Emails and OAuth Apps look exactly as they do now.

## Architecture

**The padding moves from the layout into the pages.** `auth/layout.tsx` wraps everything in
`mx-auto max-w-7xl space-y-8 p-8`, which is right for a form and wrong for a grid. The layout stops
padding; Emails and OAuth Apps each wrap their own content in what the layout used to give them.

**`min-h-full` becomes `h-full`,** and that is the part that would otherwise waste an hour. A
minimum height does not establish a definite height, so a child asking for `h-full` resolves against
`auto` and fills nothing. The shell's content area is a flex child of an `h-dvh` column, so it has a
definite height to inherit from — which is why `flex h-full` works in the Table Editor today.

**The page owns its height and scrolls inside itself:**

```
flex h-full flex-col
  header     shrink-0  border-b
  toolbar    shrink-0  border-b
  bulk bar   shrink-0            (only while rows are selected)
  table      min-h-0 flex-1 overflow-auto
  footer     shrink-0  border-t
```

`min-h-0` on the scrolling region is not decoration: a flex child defaults to `min-height: auto` and
refuses to shrink, which pushes the page taller instead of scrolling inside it. The project shell's
own comment says the same thing about the same trap.

**The rounded border around the table goes**, because it is what makes a full-bleed table look like
a card that happens to be wide.

## Related Code Files

- Modify: `app/(app)/p/[ref]/auth/layout.tsx` — stop padding, own a definite height
- Modify: `app/(app)/p/[ref]/auth/page.tsx` — full-bleed frame, no `PageHeader`
- Modify: `app/(app)/p/[ref]/auth/emails/page.tsx`, `auth/oauth/page.tsx` — keep their container
- Modify: `components/auth/users-table.tsx` — the frame, the scrolling region, the footer bar
- Read for context: `components/table-editor/editor.tsx` (the precedent), `app/(app)/p/[ref]/layout.tsx`

## Implementation Steps

1. Layout: `flex h-full`, no padding on the content column.
2. Emails and OAuth Apps: wrap their own bodies in `mx-auto max-w-7xl space-y-8 p-8`.
3. Users page: the flex column above, a compact title row, no subtitle.
4. `UsersTable`: header/toolbar/table/footer as strips; the grid scrolls in its own region.
5. Check Emails and OAuth Apps against what they look like now.

## Todo List

- [x] Layout stops padding and owns a height
- [x] Emails and OAuth Apps pad themselves
- [x] Users is a full-height flex column
- [x] The grid scrolls internally; the scrollbar is at the bottom of the window
- [x] Footer pinned, subtitle gone, card border gone

## Success Criteria

- [x] The table touches both edges of the content area.
- [x] Scrolling the grid sideways does not move the header, the toolbar or the footer.
- [x] Emails and OAuth Apps are unchanged.
- [x] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` stay green.

## Risk Assessment

- **`h-full` on a layout shared with taller pages.** Emails is longer than the window; it overflows
  the layout box and the shell's `overflow-y-auto` scrolls it, which is how the Table Editor's
  siblings already behave. Worth checking rather than assuming.
- **A pinned footer hides rows if the region is not allowed to shrink.** `min-h-0` is what prevents
  it, and its absence is invisible until the list is long enough to need scrolling.

## Built 2026-09-26

The layout is `flex h-full` and pads nothing; Emails and OAuth Apps carry the
`mx-auto max-w-7xl space-y-8 p-8` that used to be theirs by inheritance. Users is a flex column —
title strip, toolbar strip, an optional selection strip, the scrolling grid, a pinned footer — and
the card border around the table is gone.

**The `min-h-full` → `h-full` change is the load-bearing one.** Without it the page cannot ask for
`h-full` at all: a minimum height leaves the parent's height `auto`, a percentage child resolves
against `auto`, and the grid would have grown the page instead of scrolling inside it.

The bulk-selection bar lost its own rounded border — it sits in a strip that already has a rule
above and below it.

## Not verified

The browser, including the one thing worth looking at: that Emails and OAuth Apps still look exactly
as they did.
