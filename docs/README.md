# SuperDB documentation

The durable, plan-independent view of the codebase. Anything that is a record of *how a piece of work
went* — decisions, deviations, what a phase turned out to need — belongs in `plans/`, which this
directory links to rather than restates.

## The table editor

Reading, editing and altering a connected project's tables. It writes as `postgres` with row-level
security bypassed, against a database with no undo, so most of what is written down is about why the
safety model has the shape it does.

- **[The Table Editor](./table-editor.md)** — the constraint everything follows from, the three
  disciplines for the three kinds of input, the preview–confirm–execute–record path, and the module
  layout. Start here.
- **[What was measured, not assumed](./table-editor-measurements.md)** — the facts established
  against a live project. Several are counter-intuitive enough that the code implementing them looks
  wrong without them.

## Operations

- **[Secret rotation runbook](./secret-rotation-runbook.md)** — procedures for rotating encryption
  keys. Read it before rotating anything.

## Writing more of this

1. Under 200 lines per file, matching the repo's rule for source.
2. Full sentences that explain *why*. The code comments and the plan files set the tone.
3. Record a fact about Postgres or the Management API only if it was **measured**, and say so. A
   plausible claim nobody checked is worse here than no claim: it will be trusted.
4. Name real exports and real file paths. Check them against the code, not against a plan — a plan
   describes what was intended, which is not always what shipped.
