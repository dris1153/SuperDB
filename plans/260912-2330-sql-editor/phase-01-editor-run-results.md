---
phase: 1
title: "Editor, run, results"
status: pending
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Editor, run, results

## Overview

The page: an editor, a Run button, a results grid, and the error handling that makes the whole thing
usable. Everything in later phases is chrome around this.

## Requirements

**Functional**
- Write SQL, run it, see rows.
- A read-only statement runs with no prompt.
- A write is confirmed once, naming the project, then applied.
- A syntax error is reported with the offending token underlined in place.
- Multi-statement behaviour is explained, not hidden.
- Every write is audited.

**Non-functional**
- The editor bundle is scoped to this route and dynamically imported.
- The error parser is pure and tested; none of it lives inline in a component.

## The run flow

```
Run → readOnlyQuery
  ├─ 201        → render rows, nothing asked
  ├─ 400 /25006 → confirm naming the project → writeQuery
  └─ 400 other  → show the error, underline the position
```

Postgres decides whether the statement writes. Client-side detection is unreliable in principle: a
function call can write, so can a CTE, so can a trigger. Sending it to a read-only transaction makes
the database the judge, so a `SELECT` is never interrupted and a write is confirmed exactly once.

The refused attempt has no side effects — a read-only transaction rolls back. A write therefore costs
two round trips, which is a fair trade for something rare and deliberate.

## Measured API behaviour this depends on

From `scripts/probe-query-errors.mjs`, 2026-09-12, against a live project:

```
create temporary table … → 400
{"message":"Failed to run sql query: ERROR:  25006: cannot execute CREATE TABLE in a read-only transaction\n"}

selec 1 → 400
{"message":"Failed to run sql query: ERROR:  42601: syntax error at or near \"selec\"\nLINE 1: selec 1\n        ^\n"}

select 1 as ok → 201
[{"ok":1}]
```

- **No `code` field.** The SQLSTATE sits in the message: `ERROR:  <sqlstate>: <text>`. Parse with
  `/ERROR:\s+([0-9A-Z]{5}):/`. Those five characters are Postgres's own output, so Supabase can
  reword its `Failed to run sql query:` wrapper without breaking this.
- **Success is 201, not 200**, and the body is the rows array with no envelope.
- **Errors carry a position:** `LINE n:` and a caret line under the token.

## Architecture

**The parser is a pure module with tests.** `lib/sql-error.ts`:

```ts
export type SqlError = { sqlstate: string | null; text: string; line: number | null; column: number | null };
export function parseSqlError(message: string): SqlError;
export const isReadOnlyRefusal = (e: SqlError) => e.sqlstate === "25006";
```

The caret column comes from the offset of `^` in the line beneath `LINE n:`, minus the width of the
`LINE n: ` prefix. Fiddly, easy to get off by one, and exactly why it belongs in a tested function
rather than in a component.

**The editor** is CodeMirror 6 in a client component, dynamically imported so the bundle does not
land on any other route. Likely packages — **confirm the set and versions at install**, as with every
dependency in this repo: `codemirror`, `@codemirror/lang-sql`, `@codemirror/state`, `@codemirror/view`.
A decoration marks the error position.

**Results** use `react-data-grid`, already installed for the table editor. Columns come from the keys
of the first row — the endpoint returns no column metadata, so there is nothing better available. An
empty array is "no rows returned", which is also what a successful write looks like: say that, rather
than showing an empty grid.

**The confirm** follows `components/table-editor/write-confirm.tsx`, which names the *project* first.
That ordering is deliberate: the question is not "are you sure" but "are you sure about *this*
database".

**Audit.** `lib/write-audit.ts` already records a `wrote` event with the SQL truncated to 300
characters. A write from here goes through it unchanged — the table editor's writes are audited and
these are strictly more dangerous.

## Related Code Files

- Create: `app/(app)/p/[ref]/sql/page.tsx`, `lib/sql-error.ts` + test, a client editor component, a
  results component, a run server action
- Modify: `components/project-nav.tsx` — `ready: true` on the `sql` slug
- Read for context: `lib/mgmt-api.ts` (`readOnlyQuery`, `writeQuery` and their comments),
  `components/table-editor/write-confirm.tsx`, `lib/write-audit.ts`,
  `components/table-editor/grid.tsx` for how `react-data-grid` is wired here

## Implementation Steps

1. `lib/sql-error.ts` plus tests, using the three measured bodies above as fixtures. Do this first —
   everything else keys off it.
2. The run action: read-only, then write on confirmation. Return a discriminated result rather than
   throwing, so the UI can tell "needs confirmation" from "failed".
3. The route and layout: editor pane, toolbar, results panel, empty states.
4. CodeMirror, dynamically imported.
5. The results grid and the "no rows returned" case.
6. Error display, with the position underlined.
7. The multi-statement note beside the results.
8. Flip the nav slug.
9. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
10. Verify by hand, including a real write against a throwaway table.

## Success Criteria

- [ ] `parseSqlError` has tests using the three measured response bodies verbatim.
- [ ] A test pins that success is 201 — not 200.
- [ ] A `SELECT` renders rows with no prompt.
- [ ] An `UPDATE` prompts once, names the project, and applies only on confirmation.
- [ ] Cancelling the prompt leaves the database untouched.
- [ ] A syntax error underlines the offending token.
- [ ] A successful write says "no rows returned" rather than showing an empty grid.
- [ ] The multi-statement rule is stated next to the results.
- [ ] The write appears in `/settings`'s connection event log.
- [ ] The nav slug is live; "soon" is gone.
- [ ] The CodeMirror bundle does not appear in any other route's chunks.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` green.

## Risk Assessment

**A destructive statement with no undo.** This is the feature, not a defect. The mitigations are the
confirm naming the project and the audit trail; there is nothing else to add without making the page
pointless.

**Confirm fatigue.** If the refusal detection is wrong in the other direction — a read misclassified
as a write — every query prompts and the page becomes tedious enough to avoid. Verify that a plain
`SELECT` never prompts, and that the detection is on `25006` specifically rather than "any 400".

**Off-by-one in the caret column.** It will look almost right, which is worse than obviously wrong.
Tests with the measured fixture.

**Supabase rewording the wrapper.** Only `ERROR:  <code>:` is parsed, which is Postgres output. If
the prefix changes, the parser should degrade to "no sqlstate" and fall back to always-confirm rather
than silently treating a refusal as a generic error.

**The editor bundle on the wrong routes.** An entire plan exists about this app's latency. Route-scope
it and check the build output, do not assume the dynamic import worked.
