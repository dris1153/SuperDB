# Skeletons that look like what they replace

Brainstorm, 2026-09-15. Follows [the CSR plan](../260915-0110-project-pages-csr/plan.md), which put a
skeleton behind every card on the project pages and never looked at them together.

## Problem

"Skeleton loading init page đang chưa khớp." Three separate faults wearing one complaint.

### 1. Shape: flat rectangles standing in for structured content

| Site | Placeholder | What lands |
|---|---|---|
| `components/table-editor/workspace.tsx:120` | `Skeleton h-96` inside a `p-6` box | A grid at `flex-1 min-h-0` — 700px+ on a 1080p screen |
| `components/project-database/tables-card.tsx:41` | `Skeleton h-72` | A 6-column table with a header and a border |
| `components/project-overview/usage-panel.tsx:61` | One `h-40` block, full width | A horizontal carousel of `w-72` cards that bleeds up to 320px past its container |
| `connect-{sheet,framework-panel,orm-panel}` | `h-40` / `h-24` blocks | Code blocks |

The grid is the worst: 384px of grey, then a jump to full viewport height.

### 2. Two idioms on the same screen

- `components/ui/skeleton.tsx` — `border border-border bg-card/50 rounded-md`
- Inline everywhere else — `bg-muted rounded`, no border

Five colour variants in total across the repo: `bg-card/50`, `bg-muted`, `bg-muted/20`, `bg-muted/30`,
with and without a border. Tiles and stats use one; the tables card and the grid use the other, and
they sit on the same page.

### 3. `motion-reduce` missing in four places

Every inline placeholder carries `motion-reduce:animate-none`. These do not:
`ui/skeleton.tsx`, `connect-framework-panel.tsx:239`, `connect-orm-panel.tsx:95`,
`connect-sheet.tsx:298`. An accessibility fault, not a taste one.

## Options weighed

| Option | Cost | Verdict |
|---|---|---|
| Shape-matched skeletons | ~12 files | **Chosen.** The only one that fixes the complaint |
| Shimmer instead of pulse | 1 keyframe | **Also chosen**, but it does not fix shape or layout shift |
| Drop skeletons for a progress bar / stale data | small | Rejected. An empty card reads as broken, not loading; stale-dimming only helps on a revisit, which `keepPreviousData` already covers |
| Unify the primitive only | ~8 files | Rejected as the whole answer — grey blocks stay grey blocks |

## Design

### One primitive, shimmer inside it

`components/ui/skeleton.tsx` keeps its name and changes its body:

- Base `bg-muted` (#242424), sweep band at `--color-border` (#2e2e2e), `animate-shimmer`.
- `@theme { --animate-shimmer: shimmer 1.6s linear infinite }` plus the keyframes in
  `app/globals.css`. Tailwind v4 emits them on use; `tw-animate-css` ships no shimmer, checked.
- `motion-reduce:animate-none` and `aria-hidden` live in the primitive, so no call site repeats them.
- No `variant` prop. A placeholder replacing a bordered card passes `border border-border` in
  `className` — one look by default, an opt-in for the two surfaces that need a border.

### Reuse the real frame, never redraw the layout

A skeleton that redraws a layout is a second copy of it, and the copy is what goes stale.

| Site | Becomes |
|---|---|
| `table-editor/workspace.tsx` | Fills the same `flex-1 min-h-0` box; rows drawn with `repeating-linear-gradient` at the real `ROW_HEIGHT[density]` (28/36px, `column-prefs.ts:82`) under a 40px header strip |
| `project-database/tables-card.tsx` | The real `<Table>` and `<TableHeader>` with `COLUMNS`, six `<TableRow>`, one `Skeleton` per cell sized to its column |
| `project-overview/usage-panel.tsx` | Three `Card w-72` — `ServiceTileSkeleton` next to `ServiceTile` **in `service-carousel.tsx`**, same file so they cannot drift |
| `connect-{sheet,framework-panel,orm-panel}` | A code-block frame: border plus four or five mono lines of varying width |
| `sql-editor/results.tsx`, `sql-editor/workspace.tsx` | Results get the grid's row stripes; the editor gets a few code lines |
| tiles, stats, database-card, services, api-keys, saved-queries sidebar | Already the right shape — swap to the primitive |

**One element, not `n`.** `repeating-linear-gradient` fills any height at the right pitch with no
loop and no viewport measurement. The whole grid placeholder is a single div.

## Risks

- **Shimmer looks cheap on a dark ground if the contrast is wrong.** #242424 → #2e2e2e is about 4%;
  more reads as flashing. Needs an eye on it.
- **`background-position` repaints rather than compositing.** The overview shows ~15 placeholders at
  once, which is fine; the grid stripe is one element, which is why it is one element.
- **Height matching can only be proven by looking.** The constants line up — header `h-10`, cell
  `p-2`, card `w-72`, `ROW_HEIGHT` 28/36 — but "nothing moves when the answer lands" is a browser
  claim, and it joins the other browser claims still open in
  [phase 6](../260915-0110-project-pages-csr/phase-06-verify.md).

## Scope

12 files: `ui/skeleton.tsx`, `app/globals.css`, `project-database/{tables-card,stats,services,api-keys}`,
`project-overview/{usage-panel,tile,database-card}`, `service-carousel`, `table-editor/workspace`,
`sql-editor/{results,workspace,saved-queries-sidebar}`, `connect-{sheet,framework-panel,orm-panel}`.

## Success criteria

- One skeleton look across the app; five colour variants collapse to one.
- `prefers-reduced-motion` honoured everywhere, enforced in one place.
- The four shape-mismatched sites render the frame of what replaces them.
- No layout shift when an answer lands — **verified in a browser, not asserted**.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` stay green; 378 tests.

---

## What shipped, where it differs from the design above

Four commits: `fc298c6`, `21a903a`, `9693636`, `8d7f68b`.

- The shimmer is an `@utility` with a nested reduced-motion guard rather than a `--animate-*` token
  plus a `motion-reduce:` class. It covers `skeleton-rows` too, which a class on the primitive could
  not have.
- `ServiceCarouselSkeleton` stands in for the whole row rather than one tile, in `service-carousel.tsx`
  as designed.
- The connect guides' code column is a bordered block, not "four or five mono lines" — `CodeBlock`
  is a bordered box and the block matches it.
- Scope was 12 files plus three the design missed: `app/(app)/loading.tsx`,
  `app/(app)/p/[ref]/loading.tsx` and `app/(app)/p/[ref]/tables/loading.tsx` were already `Skeleton`
  consumers, so changing the primitive's default changed them. They pass the border explicitly now,
  and the tables route uses `SkeletonRows`.
- Two faults the review found were older than this work and in scope for it: the SQL results pane
  said "Click Run to execute your query." during the first run, and the Definition tab said "No
  definition could be reconstructed" while fetching and when refused. Both are fixed in `8d7f68b`.
- Measured shifts closed: 24px in the tables card (`h-4` cells against a `text-sm` line box), and the
  carousel's and usage figure's first rows against `text-2xl`.

Still open, and still needing a browser: that nothing moves when an answer lands, and how the sweep's
contrast reads on the real dark ground.
