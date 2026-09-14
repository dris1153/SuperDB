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
- [x] No new dependency was added; the three candidates' versions, publish dates and sizes are
      recorded above and in the commit.
- [x] The chart code is absent from the route's initial chunks — measured, not assumed: the chart
      chunk is 8 KB, appears in no route's `firstLoadChunkPaths`, and is referenced only by the sql
      route's loadable manifest. The route's first load moved 738 KB to 750 KB, which is the tab
      strip in `results.tsx`, not the chart.
- [x] `pnpm test` (359), `pnpm typecheck`, `pnpm lint`, `pnpm build` green.
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
