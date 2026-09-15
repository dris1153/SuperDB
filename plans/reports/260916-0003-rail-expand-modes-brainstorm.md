# The rail expands after all: three modes

Brainstorm, 2026-09-16. A correction to
[260915-2303](260915-2303-icon-rail-and-settings-panel-brainstorm.md), from two screenshots.

## What I got wrong

That report says:

> The rail in that screenshot does not expand on hover. […] Supabase had a hover-expanding rail once
> and does not now.

**Wrong, and the second screenshot proves it**: a 250px panel with full labels, overlaying the
content — the column behind it is visible on the right, its `↗` icons and BETA badge half-covered.
That is exactly what was asked for in the first place, and I inferred otherwise from a screenshot
that happened to be taken with the panel closed.

The first screenshot is this app after phase 2 — rail plus tooltip. The ask is to replace the tooltip
with that panel.

## The design, which is Supabase's own

The button at the bottom of the rail opens a menu with three options, and they are the whole feature:

| Mode | Rail | Behaviour |
|---|---|---|
| **Expanded** | a 250px panel in place of the rail | always open, takes real width |
| **Collapsed** | 48px | tooltip on hover, never expands |
| **Expand on hover** | 48px | hover or focus opens the panel over the content |

**Tooltips live only in Collapsed.** In hover mode the panel carries the labels, and two mechanisms
firing together puts a tooltip on top of a panel mid-slide.

## Three decisions, and one contradiction with yesterday's measurement

### The mode menu must not be a `DropdownMenu`

Yesterday a Radix menu was measured out of the topbar: **52,160 bytes** on every project route, to
group two links and a button (see phase 3 of the plan). Adding one to the rail pays exactly the price
just refused, for a menu opened a handful of times ever.

Hand-written instead: a button, a list, `useState`, dismiss on outside click. ~25 lines, no dependency.
Radix's full behaviour — focus trap, Escape, arrow keys — is available for 52KB and is not worth it
here; the menu has three items and no nesting.

### `localStorage`, deliberately unlike the existing precedent

`components/table-editor/session-store.ts` uses `sessionStorage`, so `useSidebarCollapsed` forgets
when the tab closes. That is right for a table editor's transient view state and wrong for this: a
person picks a nav mode once and expects it to stay picked.

### A cookie, so Expanded does not flash

The server cannot read `localStorage`, so it renders a default and the client corrects after mount.
In Expanded that flash is a 250px column appearing and shoving the content sideways on every load.

Writing the mode to a cookie as well lets the layout read it with `cookies()` and render the right
thing from the server. The layout is already dynamic — `requireUser` reads cookies — so this costs
nothing but a few lines, and removes the flash rather than hiding it behind an animation.

## The rest

- Rows and groups stay exactly as the rail has them now.
- `focus-within` opens the panel in hover mode: tab to any row and it opens, focus leaves and it
  closes. No extra machinery.
- ~150ms open delay, so a mouse crossing the rail does not trigger it.
- `prefers-reduced-motion`: the panel appears rather than slides.
- On touch there is no hover at all: tapping an icon navigates, and the mode menu is the only route
  to labels — so that button has to be legible, not a dim glyph in a corner.

## Risk

**The panel overlays `data-content-area`**, which the usage carousel measures to decide how far it may
bleed sideways. The panel is absolutely positioned so it does not change that element's size, but the
carousel bleeds 320px to the left — into exactly the strip the panel opens over. Worth checking
rather than reasoning about.

**Three modes is three states to get wrong**, and two of them look identical at first glance
(Collapsed and Expand-on-hover are both 48px until something happens). The menu has to say which is
active.

## Success criteria

- Each mode does what its name says, and the choice survives a reload with no flash.
- Tooltips appear in Collapsed and nowhere else.
- In hover mode, keyboard focus opens the panel and leaving closes it.
- The mode menu adds no measurable weight to the route — checked against the build output, since that
  is the reason it is hand-written.
- The usage carousel still bleeds correctly with the panel open over it.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` stay green — 410 tests.
