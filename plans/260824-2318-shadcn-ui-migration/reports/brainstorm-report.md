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
