---
title: "The user sheet: width, spacing, and the 10 MB it was waiting on"
status: in-progress
created: 2026-09-26
blockedBy: []
blocks: []
---

# The user sheet: width, spacing, and the 10 MB it was waiting on

Three complaints about the panel built in
[260926-0230-users-ui-parity](../260926-0230-users-ui-parity/plan.md), and four causes behind them —
written up in [260926-user-sheet-brainstorm.md](../reports/260926-user-sheet-brainstorm.md).

Two are cosmetic and one of those is a real bug: **the sheet has been 384 px the whole time**,
because the width class it asked for was never applied. The third, "user detail loads slowly", is
two separate things, and neither is the upstream API — every call it depends on answers in 144–245
ms.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The sheet itself](phase-01-sheet.md) | **in-progress** | ~2h | — |
| 2 | [Ten megabytes off the part route](phase-02-part-route-weight.md) | **in-progress** | ~3h | — |

Independent: one is the panel's own markup, the other is what a sibling reader drags into a route.

## What the measurement settled

- **`sm:max-w-2xl` never applied.** `components/ui/sheet.tsx` sets the width through a `data-*`
  variant, `tailwind-merge` keeps both classes because they are in different groups, and the base
  wins. `connect-sheet.tsx` already solved it with `sm:max-w-4xl!`.
- **Upstream is fast.** Resolve 216 ms, project key 144 ms, the user 245 ms, the factors 240 ms.
  Warm, the whole chain is about 600 ms — and the panel still shows a blank skeleton for all of it
  while the row that was clicked is sitting in the browser.
- **The part route traces 12.7 MB, of which 10.4 MB is Shiki**, reached through one reader out of
  twenty. Removing that import and rebuilding: **2.0 MB**. Measured, then reverted.

## Settled decisions

- **SQL gets coloured in the browser** by a small tested tokeniser, rather than `definition` getting
  a route of its own — an exception in the part mechanism would cost more than forty lines will.
- **896 px**, matching the connect sheet.
- **The panel seeds from the row**, which is a rendering change rather than another request.

## What this does not claim

That the route's weight *is* the cold start. `/login` traces 2.1 MB and was measured at 31 s. This
is one term of it, and the only one this repository can see.
