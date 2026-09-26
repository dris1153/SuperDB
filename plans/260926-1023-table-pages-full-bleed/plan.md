---
title: "Table pages fill the window, and the checkbox column stops touching its neighbour"
status: in-progress
created: 2026-09-26
blockedBy: []
blocks: []
---

# Table pages fill the window, and the checkbox column stops touching its neighbour

Two complaints about the Users page, compared against Supabase's own.

**It sits in a 1280 px container with 32 px of padding**, so a table with eight columns scrolls
sideways inside a box while the window has room to spare. The original runs the table to both edges
and pins the horizontal scrollbar to the bottom of the window.

**The checkbox is jammed against the avatar beside it**, which is not a spacing oversight — it is a
rule in `components/ui/table.tsx`.

## The precedent is already in this repo

`components/table-editor/editor.tsx` is `flex h-full`, owns its own height, scrolls its grid
internally and ends in a `border-t px-3 py-2` status bar. The Table Editor needs no work; Users
copies its shape.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Full-bleed Users](phase-01-full-bleed.md) | **in-progress** | ~2h | — |
| 2 | [The checkbox column](phase-02-checkbox.md) | **in-progress** | ~30m | — |

## What the code says

- **`app/(app)/p/[ref]/auth/layout.tsx` wraps every auth page in `mx-auto max-w-7xl space-y-8 p-8`.**
  Emails is a form page and wants that; Users does not. The padding moves from the layout into the
  pages that want it.
- **`min-h-full` has to become `h-full`.** A minimum height is not a definite one, so a child asking
  for `h-full` resolves against `auto` and never fills. The Table Editor works because the shell's
  content area is a flex child with a definite height and the editor asks for `h-full` directly.
- **`ui/table.tsx` sets `[&:has([role=checkbox])]:pr-0`** on both `th` and `td` — a shadcn default.
  That is why the checkbox cell has eight pixels on its left and nothing on its right.

## Settled decisions

- **Users and the Table Editor.** OAuth Apps keeps its container for now, and Storage is untouched.
- **The subtitle goes.** The original's table pages carry a title and nothing else; on a page whose
  job is a grid, a sentence costs a row of data.
- **The footer pins to the bottom**, as a status bar, the way the Table Editor's already does.

## A rhyme worth noticing

Overriding `pr-0` needs `[&:has([role=checkbox])]:pr-3` — the *same variant form* — because a plain
`pr-3` loses on specificity. This is the second time this week a variant-prefixed base class has
silently beaten a plain utility in this repo: the user sheet spent its whole life at 384 px because
`sm:max-w-2xl` never beat `data-[side=right]:sm:max-w-sm`.

Both are the same lesson: in this codebase, a class that does not appear to apply is usually losing
to a variant, not missing.
