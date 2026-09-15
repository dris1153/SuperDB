---
name: partstate-collapses-disabled-into-pending
description: useProjectPart returns status "pending" for a query that is disabled and will never run, so any `status === "pending"` aggregate is permanently true on pages that gate parts with `enabled`
metadata:
  type: project
---

`PartState` in `components/use-project-part.ts` has no "idle" case. It derives `pending` from
TanStack's `isPending`, and in v5 a query with `enabled: false` is `status: "pending"` forever
(`data === undefined`). So a part that is deliberately switched off reads exactly like one that is
still in flight.

**Why:** the four states were designed for the fan-out pages, where every part always runs. The table
editor was the first page to pass `enabled`, and it wired the off-switch straight into a `busy`
aggregate — which then never cleared.

**How to apply:** on any page that passes `enabled` to `useProjectPart`, check every consumer of that
part's `pending`. An aggregated spinner/disable flag built from `status === "pending"` is a bug the
moment one of its inputs is conditionally disabled. The honest discriminator is `fetchStatus`
(TanStack's `isLoading` = pending && fetching), which this hook does not expose. Related:
[[part-ok-true-without-data]].
