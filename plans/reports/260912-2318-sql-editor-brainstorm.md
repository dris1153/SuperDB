---
type: brainstorm-report
date: 2026-09-12
scope: the SQL Editor page
branch: perf/navigation-latency
head: 5990cc8
---

# The SQL Editor

## Problem statement

`project-nav.tsx` has declared a `sql` slug with `ready: false` since the nav was built. Asked for:
fill it, as close to Supabase's own SQL Editor as possible.

Reference: a screenshot of the real thing — left sidebar with SHARED / FAVORITES / PRIVATE / LOGS /
REFERENCE sections and a query search, a tab bar with "+ New", a toolbar carrying a Database
dropdown plus Save and Run, the editor itself, and a Results / Chart panel below.

## This is a different risk class from everything shipped so far

`docs/table-editor.md` describes a safety model built around one fact: the database has no undo. Every
write goes through preview, confirm, a re-checked row count, a typed `Statement` the executor will
only accept, and type-the-table-name friction on `auth` and `storage`.

A SQL editor deliberately hands the user arbitrary SQL. **None of that machinery transfers** — there
is no preview of an arbitrary statement's effect, and no count to re-check. Supabase's own editor
works this way too, so the goal is legitimate; but it is worth writing down that this feature
suspends the constraint every previous feature was designed around.

## Three limits measured in this repo, not guessed

| Limit | Evidence |
|---|---|
| No affected-row count | `lib/mgmt-api.ts` on `writeQuery`: *"without `RETURNING` a successful UPDATE answers `[]`, indistinguishable from one that matched nothing"* |
| Multi-statement returns only the last result set | Recorded in six places, including `docs/table-editor-measurements.md` |
| Read-only role still bypasses RLS | `readOnlyQuery` runs as `supabase_read_only_user`, which holds `rolbypassrls` — results are not RLS-filtered |

The first two are not gaps against the original. Supabase's editor hits the same API and behaves the
same way, so matching it is the faithful outcome — but the multi-statement rule needs saying in the
UI, or people will think results went missing.

## The key decision: try read-only first, confirm only when Postgres refuses

The user initially chose "always write, always confirm". That is safe and unusable: `SELECT` is the
most common action in a SQL editor, and confirming every run would make it tedious enough to avoid.

The alternative keeps the safety and removes the friction:

```
Run → readOnlyQuery
  ├─ succeeds  → render results, nothing asked
  └─ refused   → confirm naming the project → writeQuery
```

**Postgres decides, not a heuristic.** Detecting "does this statement write" in the client is
unreliable in principle — a function call can write, and so can a CTE. Sending it to a read-only
transaction makes the database itself the judge. Reads have zero friction; writes are confirmed
exactly once.

Cost: a write takes two round trips. Writes are rare and deliberate, so that trades well. The
refused attempt has no side effects — a read-only transaction rolls back.

### The dependency this rests on, unverified

The flow must recognise *read-only transaction refused* specifically, not "some error". Matching
SQLSTATE `25006` is reliable; matching an English message string is not.

**It is unknown whether the Management API surfaces the SQLSTATE or only a message.** `MgmtError`
carries a status and a body capped at 2000 characters; what Postgres detail survives into that body
has not been measured. Send one `update` to the read-only endpoint and read the response before
building on this.

If only a message comes back, this design weakens and the fallback is the user's original choice:
always `writeQuery`, always confirm.

## Decisions

| Question | Decision |
|---|---|
| Scope | Everything in the screenshot except AI generation |
| Writes | Allowed, confirmed — via the read-only-first flow above |
| Editor | CodeMirror 6 |

### Editor choice

Registry data, checked rather than assumed — the same check that found dnd-kit dormant:

| Package | Version | Last published |
|---|---|---|
| `monaco-editor` | 0.56.0 | 2026-07-20 |
| `codemirror` | 6.0.2 | 2026-02-07 |
| `@codemirror/lang-sql` | 6.10.0 | 2026-04-13 |
| `@uiw/react-codemirror` | 4.25.11 | 2026-07-08 |

All maintained; the choice is cost, not health. Monaco is literally the editor Supabase uses, so it
is the most faithful option, at the price of being the largest dependency this repo has ever taken
(~5MB unpacked) plus web-worker wiring in Next. CodeMirror 6 is modular, a few hundred KB with SQL
highlighting and completion, and fits a codebase whose only UI dependencies are Radix,
react-data-grid, Shiki and pragmatic-dnd. **CodeMirror chosen.**

## Phases

Five, each usable on its own.

| # | Delivers | Notes |
|---|---|---|
| 1 | Editor, Run, Results, empty states, nav slug on | The entire value; the rest is chrome |
| 2 | Saved queries — new table, FAVORITES / PRIVATE sidebar, search | Third per-project table this session |
| 3 | Tab bar for multiple queries | **Reuse** the table editor's `superdb:tabs:{ref}` sessionStorage pattern |
| 4 | Templates, Examples, View running queries | Static content plus one `pg_stat_activity` query |
| 5 | Chart | Recommended deferred — see below |

**Reuse, do not rebuild:** `react-data-grid` already renders the table editor's rows;
`write-audit.ts` already records a `wrote` event with the SQL truncated to 300 characters, and a write
from here must be audited exactly as one from the table editor; `write-confirm.tsx` already names the
*project* first, which is the right shape for a dialog about to write to production.

### Why phase 5 should wait

Chart needs a charting dependency — the repo hand-rolls `stacked-bars.tsx` in SVG and has no chart
library — **and** a UI for choosing axes and chart type over an arbitrary result set. That is a
sub-feature, not a tab. Lowest value of the five, highest cost. Build 1–4, then decide whether it is
still wanted.

## Three gaps against the original that cannot be closed

**SHARED.** Every user sees only their own connections; there is no multi-person organisation in this
app. The section has no meaning here — omit it rather than shipping an empty box.

**Affected-row count.** The API does not return one.

**Multi-statement results.** Only the last result set comes back.

## Risks

| Risk | Mitigation |
|---|---|
| SQLSTATE not available, breaking the read-only-first flow | Measure before building. Fallback is always-confirm |
| A destructive statement runs with no undo | The confirm names the project; the audit records it. Beyond that, this is the feature |
| Confirm fatigue if reads get caught | The whole point of read-only-first. Verify that a plain `SELECT` never prompts |
| CodeMirror bundle lands on a route the latency work cares about | Route-scoped, dynamically imported; measure against the baseline that still has not been captured |
| Multi-statement confusion | Say it in the UI, next to the results |
| Three state systems in phase 3 | Open tabs, saved queries, unsaved buffers. The table editor already solved the same shape — follow it rather than inventing |

## Success metrics

- A `SELECT` runs and renders without any prompt.
- An `UPDATE` prompts once, names the project, and applies only after confirmation.
- A refused read-only attempt leaves nothing changed.
- Every write from here appears in the connection event log.
- Pasting several statements shows the last result **and** says that is what happened.
- Saved queries survive a reload and are scoped to their project.
- The nav slug is live and no longer marked "soon".
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green (294 tests today).

## Next steps

Large enough to warrant a plan. Before phase 1 begins, send one `update` to the read-only endpoint
and record what comes back — that single response decides the run flow.

## Open questions

- Does the Management API surface SQLSTATE, or only a message? **Blocks the run flow design.**
- What the Database dropdown in the screenshot selects — plausibly a read replica or branch. Low
  value here; likely omitted rather than faked.
- Whether Chart survives contact with phases 1–4.
