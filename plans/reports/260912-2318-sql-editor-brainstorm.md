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

### Measured 2026-09-12 — the flow works

`scripts/probe-query-errors.mjs` against a live project:

```
POST /database/query/read-only   create temporary table … → 400
{"message":"Failed to run sql query: ERROR:  25006: cannot execute CREATE TABLE in a read-only transaction\n"}

POST /database/query/read-only   selec 1 → 400
{"message":"Failed to run sql query: ERROR:  42601: syntax error at or near \"selec\"\nLINE 1: selec 1\n        ^\n"}

POST /database/query/read-only   select 1 as ok → 201
[{"ok":1}]
```

**There is no `code` field, but the SQLSTATE is in the message** at a fixed position:
`ERROR:  <sqlstate>: <text>`. Parse it with `/ERROR:\s+([0-9A-Z]{5}):/`.

That matters more than it looks. Those five characters are **Postgres's own output format**, not
Supabase's prose — Supabase can reword its `Failed to run sql query:` wrapper without touching them.
So this is matching a code, not matching English, and the read-only-first flow rests on something
stable. `25006` is `read_only_sql_transaction`; `42601` is `syntax_error`.

The probe's first version reported "no code/sqlstate field — message matching only", because it only
looked for a JSON field. That conclusion was wrong and undersold the answer; the script has been
corrected so the next person running it is not misled.

### Two unplanned findings, both worth more than the question

**Errors carry a position.** The syntax error came back with `LINE 1: selec 1` and a caret under the
offending token. Supabase's editor underlines the error in place; with this, so can ours. Parse the
`LINE n:` and the caret column and mark it in CodeMirror. Not in the original scope — add it to
phase 1, it is nearly free once the message is being parsed anyway.

**Success is 201, not 200,** and the body is the rows array directly with no envelope. Worth pinning
in a test: a status check written as `=== 200` would treat every successful query as a failure.

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
| Supabase reformats its error wrapper | Only the `ERROR:  <code>:` part is parsed, and that is Postgres output, not Supabase prose |
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

Large enough to warrant a plan. The measurement that blocked it is done — see above.

## Open questions

- ~~Does the Management API surface SQLSTATE?~~ **Answered 2026-09-12** — in the message, at a fixed
  position, parseable as a code. The run flow is unblocked.
- What the Database dropdown in the screenshot selects — plausibly a read replica or branch. Low
  value here; likely omitted rather than faked.
- Whether Chart survives contact with phases 1–4.
