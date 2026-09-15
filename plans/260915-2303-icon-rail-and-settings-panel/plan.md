---
title: "Icon rail, breadcrumb, and settings as its own panel"
status: pending
created: 2026-09-15
blockedBy: []
blocks: []
---

# Icon rail, breadcrumb, and settings as its own panel

The project nav becomes a 48px column of icons, the project name moves to a topbar breadcrumb, and
Project Settings gets its own nav panel beside the rail — the layout in the Supabase dashboard
screenshot this started from.

Design, what the screenshot actually showed, and what was rejected:
[260915-2303-icon-rail-and-settings-panel-brainstorm.md](../reports/260915-2303-icon-rail-and-settings-panel-brainstorm.md).
**Read it before starting.**

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The layout owns the height](phase-01-layout-owns-height.md) | **in-progress** | ~2h | — |
| 2 | [The icon rail](phase-02-icon-rail.md) | **in-progress** | ~3h | — |
| 3 | [Topbar breadcrumb](phase-03-topbar.md) | **in-progress** | ~2h | 1, 2 |
| 4 | [Settings as a panel](phase-04-settings-panel.md) | **in-progress** | ~3h | 2 |
| 5 | [Three rail modes](phase-05-expand-modes.md) | **in-progress** | ~5h | 2, 3 |

**Phase 1 exists to be checked before anything hides its evidence.** Two pages are `h-screen` and
assume they own the viewport; the topbar in phase 3 makes that false. Doing them together means a
scroll bug and a new component land in the same change, and the symptom — a grid that miscalculates
its scroll area at the bottom of a long table — looks nothing like either.

Phases 1 and 2 are independent of each other and of everything else.

## Settled decisions

Do not re-open these during implementation:

- **The rail in `/p/` is the *project* nav, and the app nav gives up its place.** Found during
  phase 1: `components/sidebar.tsx:26` already drops the app-level sidebar to `w-12` inside a project,
  so those routes are *already* rail + panel + content. Shrinking the project nav as well would have
  produced two 48px icon columns side by side — 96px of unlabelled icons — and removed every project
  navigation label from the screen. The screenshot has one rail because Supabase has no app rail
  there: its global chrome is in the topbar. This plan does the same.
- ~~**The rail does not expand.**~~ **Reversed 2026-09-16 — and the reason it was settled was false.**
  The original entry ended "Supabase used to do it and stopped", which is not true: a second
  screenshot shows the panel open over the content, labels and all. I had inferred it from a
  screenshot taken with the panel closed, and the rest of the decision followed from that inference.
  Phase 5 builds the three modes Supabase actually has — Expanded, Collapsed, Expand on hover — and
  answers the three objections rather than dismissing them: the mode menu is the way in on touch,
  `focus-within` is the way in by keyboard, and a ~150ms delay stops a crossing mouse from firing it.
  See [the correction](../reports/260916-0003-rail-expand-modes-brainstorm.md).
- ~~**The rail holds no state.**~~ **Reversed with the entry above.** It holds one value now — which
  of three modes is on — remembered across sessions. The claim that statelessness is what made it work
  everywhere was the consolation prize of a decision made on a false premise; what actually makes it
  work everywhere is that each mode has a way in that does not depend on hover.
- **The rail still does not reuse `useSidebarCollapsed`**, and now for a second reason: that hook
  stores in `sessionStorage` and forgets when the tab closes, which is right for a table editor's view
  state and wrong for a nav mode picked once. Phase 5 uses a cookie plus `localStorage`.
- **The rail does not reuse `useSidebarCollapsed`.** That hook belongs to the table editor's sidebar,
  which is a different idiom — click to toggle, takes up space, remembered. Two sidebars can sit on
  one screen under two different laws; what they must not do is share a flag.
- **No project switcher.** The screenshot has `ZKVault ▾`. A link back to the board reaches everything,
  and a dropdown listing every project is a second feature.
- **Two groups in the settings nav, not three.** The screenshot's INTEGRATIONS and BILLING are
  external links this app does not have. Password Manager gets its own group: it is where a secret is
  kept, not where a setting is changed.

## Cross-plan notes

**[260911-1030-database-password](../260911-1030-database-password/plan.md)** phase 3 created
`app/(app)/p/[ref]/settings/{layout,page}.tsx` and `components/project-settings/settings-nav.tsx`,
and flipped the settings slug in `components/project-nav.tsx`. Phase 4 here rewrites that layout and
nav; phase 2 rewrites the project nav around the row list phase 3 established. That plan's phases 5-7
are still open but touch none of these files.

**[260910-0042-navigation-latency](../260910-0042-navigation-latency/plan.md)** phase 4 reasons about
`app/(app)/p/[ref]/layout.tsx` and which loading boundary covers it. It does not restructure that
file; phases 1 and 3 here do. Whichever lands second should re-read the other's conclusions rather
than assume they still hold.

## Success metrics

- The rail is 48px in two of its three modes; every row is named and reachable by keyboard as well as
  by mouse, greyed rows included.
- The mode survives a reload with no flash, Expanded included.
- No page scrolls vertically that did not before, and the grid and SQL editor still size their own
  scroll regions correctly at the bottom of a long result.
- The breadcrumb names the project and links back to the board on every project route.
- Settings renders as rail + nav panel + content, with both groups.
- The usage carousel still measures `data-content-area` and bleeds the same distance.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` stay green — 410 tests today.
