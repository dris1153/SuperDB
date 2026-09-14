---
title: "SQL Editor"
status: in-progress
created: 2026-09-12
blockedBy: []
blocks: []
---

# SQL Editor

Fills the `sql` slug that `components/project-nav.tsx` has carried with `ready: false` since the nav
was built. As close to Supabase's own editor as the API allows — everything in the reference
screenshot except AI generation.

Design, the measured API behaviour it rests on, and what cannot be matched:
[260912-2318-sql-editor-brainstorm.md](../reports/260912-2318-sql-editor-brainstorm.md).
**Read it before starting.**

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Editor, run, results](phase-01-editor-run-results.md) | in-progress | ~2d | — |
| 2 | [Saved queries](phase-02-saved-queries.md) | in-progress | ~1d | 1 |
| 3 | [Query tabs](phase-03-query-tabs.md) | in-progress | ~1d | 1, 2 |
| 4 | [Templates and running queries](phase-04-templates-and-running.md) | in-progress | ~4h | 1 |
| 5 | [Chart](phase-05-chart.md) | in-progress | ~1d | 1 |

Phase 1 is the whole value; the rest is chrome around it. Phase 5 is P3 and **gated — ask before
building it.**

## This feature suspends the rule every other one follows

`docs/table-editor.md` describes preview, confirm, a re-checked row count, a typed `Statement` the
executor will only accept, and type-the-table-name friction on `auth` and `storage`. All of it exists
because the database has no undo.

A SQL editor deliberately hands the user arbitrary SQL. **None of that machinery transfers** — there
is no preview of an arbitrary statement's effect and no count to re-check. Supabase's own editor
works the same way, so the goal is legitimate; but nobody should later read the table editor's docs
and conclude this page was built carelessly.

## Settled decisions

Do not re-open these during implementation:

- **The run flow tries read-only first.** Postgres decides whether a statement writes, not a
  heuristic — client-side detection is unreliable in principle, since a function call or a CTE can
  write. A `SELECT` is never interrupted; a write is confirmed exactly once.
- **The SQLSTATE is parsed out of the message**, not read from a field — there is no field. Only the
  `ERROR:  <code>:` fragment is matched, and that is Postgres's own output, not Supabase's prose.
- **Success is 201.** A check written as `=== 200` would read every successful query as a failure.
- **CodeMirror 6, not Monaco.** Both are maintained; Monaco is the faithful choice and would be the
  largest dependency this repo has ever taken.
- **SHARED is omitted, not emptied.** Every user sees only their own connections; there is no
  multi-person organisation here, so the section has no meaning.
- **Reuse, do not rebuild:** `react-data-grid` for results, `lib/write-audit.ts` for the `wrote`
  event, `write-confirm.tsx`'s shape for the dialog, `session-store.ts` + `tab-bar.tsx` for tabs.

## Three things that cannot match the original

**No affected-row count.** The API does not return one, so a write reports "no rows returned" and
nothing more.

**Multi-statement shows only the last result set.** The original behaves identically — same API — but
the UI has to say so, or people conclude results went missing.

**SHARED.** See above.

## Cross-plan notes

[260911-1030-database-password](../260911-1030-database-password/plan.md) and
[260911-0910-project-drag-ordering](../260911-0910-project-drag-ordering/plan.md) are both in
progress and both add per-project tables to `supabase/schema.sql`. Phase 2 here adds a third. No
conflict between them — but whichever lands last means one more run of that file.

[260910-0042-navigation-latency](../260910-0042-navigation-latency/plan.md) is P3 and touches
`lib/inventory.ts`, which this plan does not.

## Success metrics

- A `SELECT` runs and renders with no prompt.
- An `UPDATE` prompts once, names the project, and applies only after confirmation.
- A refused read-only attempt changes nothing.
- Every write from here appears in the connection event log.
- A syntax error underlines the offending token.
- Pasting several statements shows the last result **and says that is what happened**.
- Saved queries survive a reload and are scoped to their project.
- The nav slug is live and no longer marked "soon".
- `pnpm test` (294 today), `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green.
