# Brainstorm — Adopt shadcn/ui and restyle to DESIGN.md

Date: 2026-08-24 · Status: design approved, not implemented

## Problem

`components/ui.tsx` is 93 hand-rolled lines (Button, Input, Card, Badge, Stat, Empty) imported by 11
files. Request: replace the primitives with shadcn/ui and restyle to the existing design system.

## Honest assessment

For the components that exist today this is close to a **lateral move**. shadcn's Button/Input/Card/
Badge render the same DOM with the same kind of classes; `<button>` and `<input>` are already
accessible, so Radix adds nothing there. `Stat` and `Empty` have no shadcn equivalent and stay custom
either way. Real gains today: `asChild` via Radix Slot (currently worked around with a `buttonClass`
helper), a standard cva variant API, and a convention other developers recognise.

The justification is the **roadmap, not the current code**. The stated product direction — table
editor, SQL editor, auth user management — needs Dialog, DropdownMenu, Select, Command, Tooltip,
Tabs, Sheet, Toast and a sortable Table. Those are genuinely hard to build correctly (focus trap,
ARIA, keyboard navigation, portals, scroll lock) and are where Radix earns its keep.

## Decisions

| Question | Decision | By |
|---|---|---|
| Adoption scope | Replace all four primitives **and** pre-install the dashboard set | user |
| Token naming | Migrate fully to shadcn vocabulary | user |
| Pre-installing unused components | Accepted despite YAGNI | user |

Advisor note on the last one: normally pre-installing unused components means carrying a compliance
burden on code nobody uses. The `@theme` override below makes DESIGN.md compliance automatic, so that
burden mostly disappears and the choice is more defensible than usual. Remaining cost is dependencies
and idle files.

## Compatibility — checked, not assumed

- shadcn CLI **4.19.0** supports Tailwind v4 and React 19, emits `@theme inline` and tags every
  primitive with `data-slot`.
- Installed stack: React 19.2, Tailwind 4.3.3 → compatible.
- **Next 16 is not named in shadcn's docs** (they document Next 15). Low risk, but verify by running
  init and a production build before going further.
- New dependencies: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`,
  `tw-animate-css`, plus one Radix package per complex component.

## Token mapping

| shadcn token | Value | DESIGN.md name |
|---|---|---|
| `background` | `#121212` | Obsidian |
| `foreground` | `#fafafa` | Snow |
| `card` | `#171717` | — |
| `popover` | `#1c1c1c` | — |
| `primary` | `#3ecf8e` | Phosphor Green |
| `primary-foreground` | `#121212` | **deviation** — DESIGN.md says `#fafafa`, but white on `#3ecf8e` is ~1.7:1 contrast; the canvas colour reads at ~10:1 |
| `secondary` / `muted` / `accent` | `#242424` | Ash |
| `muted-foreground` | `#b4b4b4` | Silver Mist |
| `border` | `#2e2e2e` | Charcoal |
| `input` | `#393939` | Slate |
| `ring` | `#3ecf8e` | Phosphor Green |
| `destructive` | `#f56565` | — |

Custom tokens kept alongside, the way shadcn itself adds `sidebar-*` and `chart-*`:

| Custom token | Value | Why |
|---|---|---|
| `subtle` | `#898989` | **DESIGN.md has three text tones, shadcn has two.** Smoke is the most used tone in this codebase (41 occurrences) and has no shadcn slot. `muted-foreground` takes Silver Mist because shadcn's own components use it for readable secondary text, where `#898989` would be too dim. |
| `brand-text` | `#00c573` | Mint Pulse, link hover |
| `brand-border` | `#1f4b37` | Forest Depth, green button hover border |
| `warn` | `#f5a623` | transitional project states |

Dropped: `--color-elevated` and `--color-brand-deep` — zero occurrences, dead tokens.

## Enforcing DESIGN.md globally

shadcn components ship with `shadow-sm`/`shadow-md` and `font-semibold`, both of which DESIGN.md
forbids ("Don't add box-shadows to cards, popovers, or modals"; "the type system tops out at 500").

Rather than editing each component after every `shadcn add`, override the theme variables that
generate those utilities:

```css
@theme {
  --shadow-2xs: none; --shadow-xs: none; --shadow-sm: none;
  --shadow-md: none;  --shadow-lg: none; --shadow-xl: none;
  --font-weight-semibold: 500;
  --font-weight-bold: 500;
  --radius: 6px;              /* dashboard density, not the landing page's 16px */
}
```

`shadow-sm` still compiles, and emits nothing. `font-semibold` still compiles, and emits 500.
Verified against the production CSS: `--shadow-sm: none`, `--font-weight-semibold: 500`,
`--font-weight-bold: 500`, `--radius: 6px`, and no literal font-weight above 500 anywhere.

**Correction (found during implementation): this does not cover everything.** The claim that every
future component conforms automatically was overstated. Three of shadcn's defaults are static
utilities with no theme variable behind them, so they must be fixed in the component files:

| Violation | DESIGN.md rule | Fix |
|---|---|---|
| `focus-visible:ring-3 ring-ring/50` on Button, Input, Badge and 4 other components | "no glow ring — the green border IS the focus indicator", stated three times | strip the ring classes, keep `focus-visible:border-primary` |
| Input `bg-transparent dark:bg-input/30` | "Input Field: Background #121212" | `bg-background`, drop the dark overrides |
| `rounded-lg` (8px) on Button and Input | 6px dashboard density | `rounded-md` |

Also removed: `text-sm` forced by Card onto all its children, and Button's `active:translate-y-px`
press animation, neither of which existed before.

`aria-invalid:ring-3` is deliberately kept — it marks an invalid field, not focus, and DESIGN.md's
rule is about focus indicators.

**After every `shadcn add`, re-run:**

```bash
sed -i -e 's/focus-visible:ring-\[3px\] focus-visible:ring-ring\/50//g' \
       -e 's/focus-visible:ring-3 focus-visible:ring-ring\/50//g' \
       -e 's/focus-visible:border-ring/focus-visible:border-primary/g' \
       components/ui/*.tsx
```

So the honest split: shadows, font weight and radius scale are configuration; focus rings and a few
component-specific defaults remain manual.

## The dead import, in full

`shadcn init` writes `@import "shadcn/tailwind.css"` into globals.css. **The `shadcn` package ships no
CSS at all** — verified against `shadcn@4.19.0`: no `./tailwind.css` export, no `.css` file anywhere
in the published files. The import resolves to nothing, silently, and everything that file was meant
to provide is simply absent.

Three separate breakages traced back to it, each found only by looking at rendered output:

| Missing piece | Symptom | Fix |
|---|---|---|
| `@theme inline` token mapping | `bg-card`, `border-border`, `bg-primary` never generated. Borders fell back to `currentColor`, so everything was white-bordered and transparent. | Declare the mapping in globals.css |
| `* { border-color: var(--border) }` | Tailwind v4 defaults border-color to `currentColor`, and Table/Dialog/AlertDialog use bare `border-b`. Same white borders, second time. | One base rule |
| `@custom-variant` definitions | shadcn writes `data-open:`, `data-active:`, `data-horizontal:`; Radix emits `data-state="open"`, `data-orientation="horizontal"`. Tailwind read them as literal `[data-open]` attributes and dropped 33 rules — every dialog/popover/select open-close animation, the active tab styling, and the tabs axis. | Five `@custom-variant` lines |

```css
@custom-variant data-open (&[data-state="open"]);
@custom-variant data-closed (&[data-state="closed"]);
@custom-variant data-active (&[data-state="active"]);
@custom-variant data-horizontal (&[data-orientation="horizontal"]);
@custom-variant data-vertical (&[data-orientation="vertical"]);
```

The lesson worth keeping: **every one of these compiled cleanly and typechecked cleanly.** A missing
CSS import produces no error anywhere in the toolchain. Verifying that a token exists is not the same
as verifying that a utility class was generated — check the compiled CSS for the selector, not the
variable.

## Class migration map

Roughly 150 occurrences across 11 files — mechanical find-and-replace.

```
bg-canvas          -> bg-background
bg-panel           -> bg-card
bg-ash{/opacity}   -> bg-muted{/opacity}
border-line        -> border-border
border-line-strong -> border-input
text-fg            -> text-foreground
text-fg-muted      -> text-muted-foreground
text-fg-subtle     -> text-subtle            (41 occurrences, the big one)
text-graphite      -> text-subtle
*-brand            -> *-primary
```

## Component inventory

- **Replace with shadcn:** Button, Input, Card, Badge
- **Keep custom:** Stat, Empty (no shadcn equivalent), AuthCard, GitHubButton, OrDivider,
  ProjectStatus, ServiceStatus, Sidebar, ProjectsBoard
- **Pre-install for the dashboard phases:** Dialog, DropdownMenu, Select, Command, Tooltip, Tabs,
  Sonner
- **Delete:** `buttonClass` helper — superseded by `asChild`; the one call site is the "Connect with
  Supabase" link on the connections page.

## Risks

| Risk | Mitigation |
|---|---|
| Next 16 unproven with shadcn CLI | Run init and a production build first; stop if it misbehaves |
| Half-migrated state leaves two vocabularies | Do the token rename in one pass, not per file |
| Three-tone text collapses to two by accident | `--color-subtle` is defined up front; grep for `fg-subtle` afterwards to confirm none survive |
| Pre-installed components drift from DESIGN.md | Handled by the `@theme` overrides, not by review |
| `primary-foreground` reverted to white by someone reading DESIGN.md literally | Comment the deviation and its contrast ratio next to the token |

## Success criteria

- `tsc --noEmit`, `next build` and `npm test` all clean
- `grep -rE "(bg|text|border)-(canvas|panel|ash|line|fg|brand)\b"` returns nothing in `app/` and `components/`
- No visual regression: login, signup, projects board, project detail, connections all render as before
- No shadow anywhere in the rendered output; no font-weight above 500
- Connections page "Connect with Supabase" link still looks like a button, now via `asChild`

## Next steps

1. `npx shadcn@latest init` — verify it detects Tailwind v4 and Next 16, then build
2. Map tokens in `app/globals.css`, add the compliance overrides
3. Add the four replacement primitives plus the dashboard set
4. Run the class migration across `app/` and `components/`
5. Delete `buttonClass`, rewire the one call site
6. Verify against the success criteria

## Deviation: shadows on floating overlays (2026-08-25)

DESIGN.md says "Don't add box-shadows to cards, popovers, or modals". That rule is now followed for
cards and broken for overlays, deliberately.

Reasoning: DESIGN.md was extracted from the supabase.com landing page, which contains no dropdowns,
selects or modals. The no-shadow rule was **observed on cards and extrapolated** to floating surfaces
that were never in the sample. A menu overlapping the page needs a depth cue a 1px border cannot give,
and the real Supabase dashboard shadows its dropdowns.

Scoped by shadow size rather than by component, because the sizes already map cleanly:

| Size | Used by | Value |
|---|---|---|
| `shadow-md` / `shadow-lg` | select, dropdown-menu, popover — nothing else | restored, much darker than Tailwind defaults |
| `shadow-sm` / `xs` / `2xs` | tabs trigger only | still `none` |

So cards and every component added later stay flat with no per-component work.

Tailwind's default `rgb(0 0 0 / 0.1)` is invisible over #121212; the restored values run at 0.4–0.6.

### Surface ladder

The real cause of "the popover blends into the background" was not the missing shadow: DialogContent
and SelectContent both used `bg-popover`, so they were **the same colour**. Now:

```
#121212  page
#171717  card and dialog
#1c1c1c  select, dropdown, popover — floating above
```

### Rings replaced with borders

Six components outlined their surface with `ring-1 ring-foreground/10` — a translucent white ring,
not the #2e2e2e border DESIGN.md specifies: alert-dialog, card, dialog, dropdown-menu, popover,
select. All now use `border border-border`. PopoverContent had no border utility at all, so the tag
picker rendered with no outline whatsoever.
