---
name: null-reads-as-error-not-loading
description: presentation components in this repo treat a null/empty prop as "could not read" or an instruction, so passing it while a query is in flight renders an answer as the loading state — three sites confirmed, one still open
metadata:
  type: project
---

A prop that used to mean "the server read failed" gets reused for "not back yet", and the component
prints a definite answer during a wait. Recurring bug class here; check it on every review.

Status as of 2026-09-15:

- `components/table-editor/workspace.tsx` — **fixed**. Splits on a separate `rowsPending` prop and
  renders a grid-shaped skeleton; `Could not read {schema}.{table}` is now only the failure path.
- `components/table-editor/definition.tsx` — **still open**. `ddl === null` renders
  `No definition could be reconstructed for this relation.` and `editor.tsx` passes
  `definition?.ddl ?? null`, which is null for pending/idle/refused/failed alike. Every first visit
  to the Definition tab shows that sentence before the DDL arrives.
- `components/sql-editor/results.tsx` — **still open**. `rows == null` renders
  `Click Run to execute your query.`, so the first Run in a tab tells the user to do what they just
  did, at 50% opacity.

**Why:** these were written against the old server pages, where null could only come from a failed
`safe()` call — there was no "not yet". The CSR migration introduced a third meaning and did not
revisit the presentation components.

**How to apply:** for any component taking `T | null`, ask what null means when the query is
`pending` *and* when it is `idle`. The fix is a third value (a `pending` boolean prop), not
`placeholderData` alone. Related: [[partstate-collapses-disabled-into-pending]],
[[part-ok-true-without-data]].
