---
phase: 5
title: "Three rail modes"
status: in-progress  # code done; every behavioural check needs the app
priority: P2
effort: "5h"
dependencies: [2, 3]
---

# Phase 5: Three rail modes

## Overview

The rail gains the control Supabase has at its foot: **Expanded**, **Collapsed**, **Expand on hover**.

## This reverses a settled decision, and says so

The plan's settled list contains:

> **The rail does not expand.** Fixed icons plus a tooltip, as the screenshot has. Hover-expand was
> rejected on three counts […] Supabase used to do it and stopped.

**The last sentence was wrong** and the rest followed from it. A second screenshot, 2026-09-16, shows
the panel open over the content — labels, groups, the column behind it half-covered. I had inferred
"Supabase stopped doing this" from a screenshot taken with the panel closed.

The three objections were real and are answered rather than dismissed:

| Objection | Answer |
|---|---|
| No hover on touch | The mode menu is the way in, and Collapsed keeps its tooltips |
| Keyboard cannot reach it | `focus-within` opens the panel; leaving closes it |
| Fires when a mouse crosses | ~150ms open delay |

## The modes

| Mode | Rail | Behaviour |
|---|---|---|
| Expanded | a 250px panel **in place of** the rail | always open, takes real width |
| Collapsed | 48px | tooltip on hover, never expands |
| Expand on hover | 48px | hover or focus opens the panel **over** the content |

**Tooltips exist only in Collapsed.** In hover mode the panel carries the labels; both at once puts a
tooltip on top of a panel mid-slide.

## Requirements

- The mode is remembered across sessions and restored without a flash.
- The menu says which mode is active — Collapsed and Expand-on-hover are both 48px at rest and
  otherwise indistinguishable.
- Hover mode: the panel overlays, it does not push.
- `prefers-reduced-motion`: the panel appears rather than slides.

## The mode menu is hand-written, and that is a measurement

Phase 3 measured a Radix `DropdownMenu` out of the topbar: **52,160 bytes** on every project route, to
group two links and a button. Adding one here pays the price just refused, for a menu opened a handful
of times ever.

A button, a list, `useState`, dismiss on outside click. Radix's full behaviour — focus trap, Escape,
arrow keys — costs 52KB and buys little for three flat items. **Check the route size afterwards**: if
this turns out to cost the same, the reasoning was wrong and Radix is the better-tested option.

## Storage: a cookie *and* `localStorage`, for two different jobs

**`localStorage`, not `sessionStorage`.** `components/table-editor/session-store.ts` uses the latter,
so `useSidebarCollapsed` forgets when the tab closes — right for a table editor's transient view
state, wrong for a nav mode someone picks once.

**A cookie as well, so Expanded does not flash.** The server cannot read `localStorage`: it renders a
default and the client corrects after mount, which in Expanded means a 250px column appearing and
shoving the content sideways on every load. The layout is already dynamic — `requireUser` reads
cookies — so reading one more is free, and it removes the flash rather than animating over it.

Two stores for one value needs a rule about which wins: **the cookie is what the server renders and
`localStorage` is not consulted before hydration**, so they cannot disagree visibly. If that turns out
to be more trouble than the flash, drop `localStorage` and keep the cookie alone.

## Related Code Files

- Modify: `components/project-nav.tsx`, `app/(app)/p/[ref]/layout.tsx`
- Create: `components/project-nav-mode.tsx` (the menu), and wherever the mode is read
- Read for context: `components/table-editor/session-store.ts` for the precedent this departs from

## Implementation Steps

1. The mode: cookie read in the layout, passed down; `localStorage` and the cookie written together.
2. The three renderings, and tooltips confined to Collapsed.
3. The menu, hand-written, showing the active mode.
4. Hover and `focus-within` with the delay; reduced-motion path.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — **and the route sizes**, which are the
   check on the hand-written menu.

## What landed

- `lib/nav-mode.ts` + 5 tests — the three modes, the cookie, and `parseNavMode`, which treats anything
  unrecognised as the default because a cookie is a string the user can write by hand.
- `components/project-nav-mode.tsx` — the menu, hand-written.
- `components/project-nav.tsx` — the three renderings.
- `app/(app)/p/[ref]/layout.tsx` — reads the cookie so the first paint is already right.

**`localStorage` was dropped, not deferred.** The phase called for a cookie *and* `localStorage`, with
a rule about which wins. Writing it made the rule pointless: the cookie is what the server renders
from, so nothing would ever read the other one. A store nothing reads is not a fallback, it is dead
code.

**The hand-written menu held up.** Route sizes went up by **3,217–3,582 bytes** — and that covers the
three modes, the delay, the focus handling and the menu together, against **52,160 bytes** for the
Radix dropdown that was measured out of the topbar. The criterion said to check rather than assert,
and the check passed.

**Opening waits, closing does not.** The delay is on the way in only; a panel that lingers after the
mouse has left reads as stuck rather than deliberate.

## Success Criteria

- [ ] **Needs the app.** Each mode does what its name says.
- [ ] **Needs the app.** The choice survives a reload with no flash, `expanded` included — the reason
      for the cookie, and the only criterion the cookie exists to satisfy.
- [ ] **Needs the app.** Tooltips appear in `collapsed` and nowhere else.
- [ ] **Needs the app.** In `hover`, keyboard focus opens the panel and leaving closes it.
- [x] The menu names the active mode, with a check beside it.
- [x] Route sizes moved 3,217–3,582 bytes for the whole feature, against 52,160 for a Radix menu
      alone. The hand-written menu was the right call and is now measured rather than argued.
- [ ] **Needs the app.** The usage carousel still bleeds correctly with the panel open over it.
- [x] `pnpm test` still green — 415, five of them new.

## Risk Assessment

**The panel overlays `data-content-area`**, which the usage carousel measures to decide its bleed. The
panel is absolutely positioned so the measured element does not change size — but the carousel bleeds
320px to the left, into exactly the strip the panel opens over. Check it rather than reason about it.

**Three states, two of which look identical at rest.** Collapsed and Expand-on-hover are both 48px
until something happens, so a menu that does not mark the active one leaves no way to tell which is
on.

**A second storage mechanism.** Two stores for one value is a chance for them to disagree. The rule
above keeps it invisible; if it does not hold up, the cookie alone is sufficient and `localStorage`
should go.
