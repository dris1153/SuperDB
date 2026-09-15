---
phase: 5
title: "Chart"
status: in-progress
priority: P3
effort: "1d"
dependencies: [1]
---

# Phase 5: Chart

## Gate — passed

Asked, and opened on 2026-09-14 after phases 1 to 4 landed. The argument against building it is
below, kept as written, because it is what the decisions in this phase answer.

**The original recommendation was: do not build it until phases 1 to 4 have been used in anger.**

- It needs a **charting dependency**. The repo has none; `components/stacked-bars.tsx` is hand-rolled
  SVG for one fixed shape and does not generalise.
- It needs a **UI for choosing axes and chart type** over an arbitrary result set — which columns are
  numeric, which is the category, what happens with one row or fifty columns. That is a sub-feature,
  not a tab.
- Charting an ad-hoc SQL result is occasional. Reading the rows is what happens every time.

## Overview

A Chart tab beside Results, plotting the current result set.

## Requirements

**Functional**
- Choose a chart type and which columns are the axes.
- Plot the current result set; update when it changes.
- Say clearly when a result cannot be charted, rather than rendering nothing.

**Non-functional**
- Any new dependency is registry-checked for maintenance before it is added, as with every other
  dependency here.
- The chart code loads only when the tab is opened.

## Architecture — as built

**Hand-rolled SVG, no dependency.** Checked against the registry rather than reputation, 2026-09-14:

| Package | Version | Published | Unpacked |
|---|---|---|---|
| recharts | 3.10.1 | 2026-09-09 | 7.4 MB |
| chart.js | 4.5.1 | 2025-10-13 | 6.2 MB |
| uplot | 1.6.32 | 2025-03-14 | 545 KB |

All maintained; recharts was published five days ago. The decision is not about maintenance, it is
about proportion: two chart types over an ad-hoc result set are not worth megabytes on a route that
an entire other plan exists to make faster, and this route already carries CodeMirror. None of the
three would help with the part that is actually hard.

**That hard part is deciding what to plot, and it is a pure tested module.** `lib/chart-data.ts`:

- **Numbers arrive in two shapes.** `int` and `float8` come back as JSON numbers; `numeric` and
  `bigint` come back as **strings**, because JSON cannot carry them exactly. A `typeof === "number"`
  check would decide that every `count(*)` and every money column is text — which is precisely the
  silent-wrong-chart failure this phase's risk section warns about.
- A column is numeric when it has at least one value and every value it has is a number. Booleans are
  not numbers: plotting true and false as 1 and 0 is a chart nobody asked for.
- The default is the first non-numeric column against the first numeric one — the shape of nearly
  every `group by`. An all-numeric result still gets an axis, because a year or an id is a good one.
- Rows whose value is not a number are **dropped, not zeroed**, and the count of them is shown. A gap
  is honest; a zero is a measurement nobody took.
- Points keep the statement's own order. The `order by` is the author's answer to what order this is
  in, and re-sorting would quietly disagree with the grid beside it.

**The vertical scale always includes zero.** A bar chart with a floating baseline exaggerates every
difference on it, which is the oldest way for a chart to lie by accident.

**200 points**, after which a bar chart is a smear; the header says how many rows were cut.

## Related Code Files

- Create: a chart component, and its column inference as a pure tested module
- Modify: the results panel, to host the tab
- Read for context: `components/stacked-bars.tsx` for the hand-rolled precedent

## Implementation Steps

1. **Pass the gate.** Confirm it is still wanted.
2. Decide hand-rolled versus library, with registry data in hand.
3. Column inference as a pure tested function.
4. The chart and its controls.
5. The not-chartable case.
6. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Review findings, and what came of them

Reviewed 2026-09-14. Two High, both real, both about a chart that would have looked fine:

- **An all-zero result drew upside down.** `select count(*)` on an empty table gives a span of zero;
  dividing by it put the baseline at the *top* of the frame with a one-pixel bar hanging from it,
  which reads as a large value for a result that is entirely nothing. It also printed a tick of
  `-0.5`, a number the data does not contain, and gave two ticks the same React key. The scale now
  lives in `lib/chart-data.ts` as `scaleOf`, with tests — including this case, mixed signs, and
  tick deduplication. The review's own point stands: **the drawing can lie as easily as the
  inference**, and only one of the two was tested.
- **The inference window and the drawing window disagreed.** Columns were classified over every row
  while only the first 200 were plotted, so one text value in row 50,000 quietly removed a column
  from the picker, and a column whose values all sat past the cut was offered and then plotted
  nothing under the message "nothing here is a number". Both windows are now the rows that are
  drawn — which also keeps a full scan of an unbounded result off every render.

Medium and low, same pass:

- `Number()` accepts `0x10`, `0b1010` and `0o17`, none of which Postgres emits for a number. A column
  of hex ids or colour codes would have been charted at its base-10 value. Shape-checked first now,
  with tests, and `"Infinity"`/`"NaN"` as text are pinned too.
- Axis labels were rounded to two decimal places, so a result of rates printed `0`, `0`, `0` beside
  bars of visibly different heights. Four significant digits instead.
- **The default value column is now the last numeric one, not the first.** A `group by` puts its
  aggregate at the end; a `select *` puts the primary key at the front — so the old rule charted ids
  by name for the most ordinary query anyone runs.
- The Results panel is keyed by tab, like the editor: which view is open, and which columns are
  charted, belonged to the tab that ran the statement rather than following the user to the next one.

Known and accepted: a `bigint` beyond 2^53 loses precision once plotted, so its tooltip can disagree
with the grid by one; and `select *` over a join can return two columns of the same name, which JSON
merges before any of this sees it. Neither is created here, and neither has a fix that is smaller
than the problem.

## The chart UI, rebuilt

Raised 2026-09-14 against Supabase's own Chart tab. Three defects, all measurable:

- The SVG width came from the point count — `max(320, 56 + 8 + 7 * 28)` is **320px for seven
  points**, sitting in a pane a thousand pixels wide.
- A timestamp column stringified to `2026-09-01T04:00:00+00:00`: twenty-five characters, truncated
  to seventeen and rotated −35°, which was most of what made it unreadable.
- No vertical grid, no legend, no range captions, and the controls in an eleven-pixel strip.

Now: an options panel beside the plot (X Axis, Y Axis, Cumulative, Show labels, Show grid, Flip), a
width measured with `ResizeObserver` that scrolls only when the points genuinely need more room, flat
timestamp labels, grid on both axes, a legend, and the first and last label under the plot. The
component split three ways to stay under the repo's 200-line rule.

**Timestamps are formatted per column, never per value.** Every non-null value must match
`^\d{4}-\d{2}-\d{2}` *and* parse. One value that does not, and the whole column stays text: an axis
that is half dates and half raw strings lies about what it is showing.

**Cumulative defaults on**, matching the original — and the legend *and* the accessible name both say
so, because a running total is a different measurement from the one the query returned. Over a
truncated result they say "(cumulative, first rows)": the last bar is the total of what was drawn,
not a grand total.

**Flip is offered only when the category column is numeric.** Swapping a text column onto the value
axis leaves nothing to measure, so the control is disabled with that reason on it rather than
failing when pressed.

## Review findings on the rebuild

Reviewed 2026-09-14. Two High, both invisible to the test suite, both fixed:

- **The chart could render nothing at all, silently.** The width was measured by a `useEffect` with
  an empty dependency list, but the element it measures sits behind the not-chartable early return.
  Run a text-only query, open Chart, then run a chartable one in the same tab — `Results` is keyed by
  editor tab, so the component never remounts, the effect never runs again, the width stays zero and
  the pane stays empty. No chart, no message, no error. It is a callback ref now, attached and
  detached with the element itself.
- **Zone-less timestamps were shifted by the reader's clock.** Probed against the endpoint
  2026-09-14: `timestamptz` returns `2026-09-14 16:55:59.660151+00`, but `timestamp` and anything
  cast with `::text` return `2026-09-14 16:55:59.660151` with nothing on the end. `Date.parse` reads
  that second form in the browser's zone, and formatting it back in UTC then moved it — measured
  here, `16:55` rendered as `09:55`, and a midnight value moved to the previous day. Zone-less text
  is now stamped UTC before parsing, with a test that fails in any zone but UTC without the fix.

Also fixed: the padding was subtracted twice, so the plot left 24px empty on the right — the exact
thing this rebuild set out to stop; the axis budgeted for full label lengths while drawing truncated
ones, so a single long JSON label thinned a seven-point axis down to two; a column choice was
shadowed rather than dropped and could reappear on a later result that selected the same names; a
dead "nothing here is a number" branch that `numericColumns` makes unreachable; and the chart-type
buttons signalled their state by colour alone.

## Superseded: both charts moved to recharts

2026-09-15. The decision below — hand-rolled SVG, no dependency — was reversed deliberately, for a
reason the original argument did not weigh: **one library for every chart in the app**, and the
animation that comes with it. The costs were put on the table again first and the answer was still
yes, so this section records what it actually cost rather than pretending the earlier argument won.

The app has exactly two charts: this one, and `components/stacked-bars.tsx`, the sparkline in the
project overview's service cards. Both are recharts now.

**What it cost, measured after the build:**

| Route | Before | After |
|---|---|---|
| `/p/[ref]` | 757,609 | 761,452 (+3,843) |
| `/p/[ref]/sql` | 750,077 | 750,282 (+205) |
| `/`, `/p/[ref]/tables` | — | +31 |

recharts itself lands in lazy chunks of roughly 400KB uncompressed and is in **no route's first
load**, because both charts are behind `next/dynamic`. The sparkline pays for that by leaving the
server-rendered HTML: it used to paint before hydration, and now paints after the chunk arrives,
behind a placeholder of exactly its own height. That is the trade, on the one route another plan
exists to speed up.

recharts 3.10.1 installs ≈20.8MB of packages, including `@reduxjs/toolkit`, `react-redux`, `immer`
and `reselect` — a state-management stack inside a charting library — plus `victory-vendor` (d3) and
`es-toolkit`.

**`lib/chart-data.ts` did not move, and that is the point.** Everything that decides *what* to draw
stays tested: the column inference, the numeric-as-string rule, the cumulative series, the per-column
timestamp axis, and `scaleOf`. `labelStride` was deleted with its test, because recharts decides tick
spacing now.

**The domain and the ticks are handed to recharts explicitly.** Its own default domain starts at the
lowest value rather than at zero — the exact defect this phase fixed once already — and against a
pinned domain it crowds its last two ticks together (`0, 350, 700, 1.1K, 1.2K` for `[0, 1234]`). Both
come from `scaleOf` now, so the tests that guard them still guard something.

## Review findings on the migration

Reviewed 2026-09-15, by running recharts' own domain and scale functions rather than reasoning about
them. The zero-including domain was verified to survive for all-zero, all-negative, mixed-sign and
empty results — recharts can only widen a user domain, never narrow it. Fixed:

- **recharts' accessibility layer is on by default**, which makes each chart's `<svg>` focusable with
  `role="application"` — inside a wrapper that said `role="img"`, whose descendants are presentational.
  Six service cards meant six unnamed tab stops in a horizontally scrolled row, each scrolling the
  carousel sideways when focused. The sparkline turns the layer off: it has no tooltip for a keyboard
  to drive. The SQL chart keeps it and drops the wrapper's `role="img"`, labelling the chart itself.
- **The Y tick ladder had regressed** and `scaleOf().ticks` had gone dead. Passed explicitly now.
- **"Show grid" off removed the baseline too.** The horizontal lines stay, faintly: a mixed-sign
  result with no line at zero gives no way to see where zero is. Only the vertical lines toggle.
- **A hook duplicating a library built-in.** `isAnimationActive` defaults to `'auto'`, which already
  resolves to "not server-rendered and not `prefers-reduced-motion`" — and passing `true` would have
  overridden the server half of that guard. The hook is deleted.
- A zero-valued bar vanished entirely; `minPointSize={1}` restores the hairline the hand-rolled
  version drew. The two loading placeholders now stop pulsing under `prefers-reduced-motion` — they
  were the only animation such a reader would have seen on those pages.

Known and not fixed: recharts resolves `react-is@16` for its `<Cell>` lookup, which cannot recognise
a React 19 element. Nothing here uses `<Cell>`, so it is inert — but it is a trap for whoever adds
per-bar colouring. pnpm 11 no longer reads `pnpm.overrides` from `package.json`, so pinning it needs
a `pnpm-workspace.yaml` this repo does not have, which is more machinery than the risk earns today.

## Success Criteria

- [x] The gate was explicitly passed, not assumed — asked at the end of phase 4, opened by the
      answer.
- [x] A two-column result charts with no configuration: first text column against first numeric.
- [x] Axis and type overrides work, and a choice naming a column the next result does not have is
      dropped rather than carried over.
- [x] A result that cannot be charted says why, and says which case it is: no rows, or nothing
      numeric in it.
- [x] Column inference **and the scale** are tested — 27 tests in `lib/chart-data.test.ts`:
      all-text results, a single row, an empty result, booleans, nulls, a column with one text value
      in it, the numeric-as-string case that would otherwise mis-read every `count(*)`, hex and octal
      literals, and the all-zero scale that used to draw upside down.
- [~] No new dependency was added — true until 2026-09-15, when recharts was adopted deliberately
      for one charting library across the app. See the superseding section above for what it cost.
- [x] The chart code is absent from the route's initial chunks — measured, not assumed: the chart
      chunk is 12 KB after the rebuild, appears in no route's `firstLoadChunkPaths`, and is
      referenced only by the sql route's loadable manifest. The route's first load moved 738 KB to 750 KB, which is the tab
      strip in `results.tsx`, not the chart.
- [x] `pnpm test` (371 after `labelStride` was retired), `pnpm typecheck`, `pnpm lint`, `pnpm build` green.
- [ ] **Needs the app.** The tab appears with a result, the chart renders, and the pickers change it.

## Risk Assessment

**Building it because it was planned.** The gate exists for exactly this. A tab nobody opens still
has to be maintained, and it will be the least understood code on the page.

**Inference that guesses wrong quietly.** Picking the wrong column produces a chart that looks fine
and means nothing — worse than an error. Show which columns were chosen and make the override
obvious.

**Bundle on a latency-sensitive route.** The same concern as CodeMirror in phase 1, with less
justification behind it. Load on tab open, and check the build output rather than trusting the
dynamic import.
