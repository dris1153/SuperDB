# An icon rail, a breadcrumb, and settings as its own panel

Brainstorm, 2026-09-15. From a Supabase dashboard screenshot and "the project sidebar should collapse
to icons and expand over the content on hover".

## What the screenshot actually shows

Three things were read off the image rather than assumed, and two of them changed the design:

1. **The rail in that screenshot does not expand on hover.** It is a fixed ~56px icon column; the
   thing with words is a *second* panel — the settings nav, ~300px, grouped CONFIGURATION /
   INTEGRATIONS / BILLING. Supabase had a hover-expanding rail once and does not now. So "like the
   screenshot" and "expands over the content on hover" were two different designs, and only one was
   in the picture.
2. **The project name and branch sit in a topbar**, as `DrisDev / ZKVault / main`. This app has no
   topbar at all — `project-nav.tsx:61-72` keeps "All projects" and the project name in the sidebar
   header, which a 48px rail cannot hold.
3. The app already has a collapse idiom, and it is a different one: `table-editor/sidebar.tsx:44`
   toggles on **click**, `w-12` ↔ `w-60`, remembered in sessionStorage, and **takes up space**.

Against hover-expand specifically: it does not exist on touch, needs `focus-within` to be reachable
by keyboard, and fires when a mouse merely crosses the rail — dropping a panel over whatever the
reader was looking at.

## Decisions

| Question | Chosen | Rejected |
|---|---|---|
| Rail behaviour | Fixed icons + tooltip, as in the screenshot | Hover-expand overlay (touch, keyboard, accidental opens); click-toggle like the table sidebar (consistent, but not the screenshot and still costs width) |
| Project name | A topbar breadcrumb | Icon-only in the rail; a per-page header in each of five pages |
| Settings nav | Its own panel beside the rail, grouped | Keep today's 208px column inside the content area |

**A project switcher (`ZKVault ▾`) is deliberately out of scope.** The screenshot has one; a link back
to the board is enough to get anywhere, and a dropdown that lists every project is a second feature.

## Design

### The rail

`components/project-nav.tsx` goes from `w-60` to `w-12`. Each row is an icon with a
`Tooltip side="right"` carrying its label; greyed rows keep their treatment and say "soon" in the
tooltip.

**The rail holds no state at all** — no collapsed flag, nothing remembered, nothing to restore. That
is what makes it work on touch and keyboard without special cases, and it is the reason to prefer it
over the hover version rather than a matter of taste.

Two details that fail silently if missed:

- Radix ignores pointer events on a disabled element, so a tooltip on a greyed row needs a wrapper or
  it simply never appears — with no error.
- At 48px the tooltip is the *only* thing naming a row, so keyboard users must be able to reach it.
  Radix opens on focus, but only for an element that actually takes focus: a greyed row has to be a
  `<button disabled>` or carry `tabindex`, not a bare `<span>`.

### The topbar

A bar in `app/(app)/p/[ref]/layout.tsx` with the link back to the board and the project name — the two
things moving out of the sidebar header.

**This is the part that breaks things.** `components/sql-editor/workspace.tsx:75` and
`components/table-editor/editor.tsx:140` are both `h-screen`, and
`app/(app)/p/[ref]/tables/loading.tsx:9` matches them. Adding a 40px bar above makes those pages
`100vh + 40px` tall: the whole app grows a vertical scrollbar, and — worse — the grid and the editor
compute their own scroll areas from a height that is now wrong. The symptom shows up at the bottom of
a long table, not on the screen where the change was made.

The fix is for the layout to own the height (`h-dvh`, `flex-col`, content `min-h-0 flex-1`) and for
both editors to use `h-full`. Three files, and they cannot be done one at a time.

### Settings as a panel

`app/(app)/p/[ref]/settings/layout.tsx` becomes a nav column against the rail with the content beside
it, dropping today's `max-w-5xl` wrapper. The project layout does not change — the settings layout
builds its own frame.

Two real groups, where the screenshot has three:

```
CONFIGURATION    General · Infrastructure · Database · API · Auth · Storage · Domains
SECURITY         Password Manager
```

The screenshot's other two groups are external links (Data API, Vault, Subscription, Usage) that this
app does not have. Password Manager earns its own group rather than being filed under configuration:
it is where a secret is kept, not where a setting is changed.

## Risks

- **Height, and it is not cosmetic.** Both editors assume they own the viewport. A half-finished
  change leaves them computing scroll regions against the wrong height, and the defect appears far
  from the edit.
- **Tooltips on disabled rows disappear without an error**, which is the failure mode that survives
  review.
- **A 48px rail makes the tooltip load-bearing.** If a row cannot take focus, its name is unreachable
  by keyboard and there is nothing else on the page that says what it is.
- `data-content-area` on the project layout is measured by the usage carousel to work out how far it
  may bleed sideways. Restructuring that element without keeping the attribute breaks the carousel
  quietly.

## Success criteria

- The rail is 48px, every row reachable and named by keyboard as well as by mouse.
- No page scrolls vertically that did not before; the grid and the SQL editor still size their own
  scroll areas correctly at the bottom of a long result.
- The breadcrumb links back to the board and names the project on every project route.
- Settings renders as rail + nav panel + content, with both groups.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` stay green — 410 tests today.

## Next

Worth planning rather than cooking straight through, mainly so the `h-screen` change is its own step:
it touches shared layout, and it should be checked before a topbar exists to hide the evidence.
