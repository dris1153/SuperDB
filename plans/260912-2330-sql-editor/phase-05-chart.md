---
phase: 5
title: "Chart"
status: pending
priority: P3
effort: "1d"
dependencies: [1]
---

# Phase 5: Chart

## Gate — ask before building this

**Recommended: do not build it until phases 1 to 4 have been used in anger.**

Lowest value and highest cost of the five, and the argument is concrete rather than a feeling:

- It needs a **charting dependency**. The repo has none; `components/stacked-bars.tsx` is hand-rolled
  SVG for one fixed shape and does not generalise.
- It needs a **UI for choosing axes and chart type** over an arbitrary result set — which columns are
  numeric, which is the category, what happens with one row or fifty columns. That is a sub-feature,
  not a tab.
- Charting an ad-hoc SQL result is occasional. Reading the rows is what happens every time.

The scope answer included it, so it stays planned rather than dropped. But ask first.

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

## Architecture

Open until the gate is passed. Two shapes to weigh at that point:

**Hand-rolled SVG** — no dependency, follows `stacked-bars.tsx`, realistically supports one or two
chart types. Enough if the honest need is "see this number over time".

**A charting library** — more types and better axes, at the cost of the dependency and its bundle on
a route an entire other plan exists to speed up. Check maintenance with `npm view` rather than
reputation: that check found dnd-kit dormant since 2024 and Pragmatic DnD current, and it took thirty
seconds.

**The column-picking problem is the real work either way.** The endpoint returns no type metadata —
measured, same as everything else here — so numeric columns have to be inferred from the values.
Default to the first non-numeric column as the category and the first numeric one as the value, and
let the user override both.

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

## Success Criteria

- [ ] The gate was explicitly passed, not assumed.
- [ ] A two-column result charts with no configuration.
- [ ] Axis and type overrides work.
- [ ] A result that cannot be charted says why.
- [ ] Column inference is tested, including all-text results, a single row, and an empty result.
- [ ] Any new dependency's maintenance status was checked and recorded in the commit.
- [ ] The chart code is absent from the route's initial chunks.

## Risk Assessment

**Building it because it was planned.** The gate exists for exactly this. A tab nobody opens still
has to be maintained, and it will be the least understood code on the page.

**Inference that guesses wrong quietly.** Picking the wrong column produces a chart that looks fine
and means nothing — worse than an error. Show which columns were chosen and make the override
obvious.

**Bundle on a latency-sensitive route.** The same concern as CodeMirror in phase 1, with less
justification behind it. Load on tab open, and check the build output rather than trusting the
dynamic import.
