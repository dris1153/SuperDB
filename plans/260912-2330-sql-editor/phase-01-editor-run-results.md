---
phase: 1
title: "Editor, run, results"
status: in-progress
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

- [x] `parseSqlError` has tests using the three measured response bodies verbatim — 15 tests in
      `lib/sql-error.test.ts`, the refusal and syntax bodies copied from the probe run unedited.
- [x] A test pins that success is 201 — not 200: `lib/mgmt-api.test.ts`, "a query answers 201, and
      201 is a success".
- [ ] **Needs the app.** A `SELECT` renders rows with no prompt.
- [ ] **Needs the app.** An `UPDATE` prompts once, names the project, and applies only on
      confirmation.
- [ ] **Needs the app.** Cancelling the prompt leaves the database untouched.
- [ ] **Needs the app.** A syntax error underlines the offending token.
- [x] A successful write says "Success. No rows returned." rather than showing an empty grid —
      `components/sql-editor/results.tsx`.
- [x] The multi-statement rule is stated next to the results, permanently: detecting several
      statements would need a parser that handles strings and dollar quotes, and the rule is true of
      every run anyway.
- [ ] **Needs the app.** The write appears in `/settings`'s connection event log.
- [x] The nav slug is live; "soon" is gone — `ready: true` on the `sql` slug.
- [x] The CodeMirror bundle does not appear in any other route's chunks. Measured from
      `.next/diagnostics/route-bundle-stats.json`: the 424KB chunk is referenced only by
      `/p/[ref]/sql`, and not in that route's first load either — it is behind the dynamic import.
- [x] `pnpm test` (316), `pnpm typecheck`, `pnpm lint`, `pnpm build` green.
- [x] An unqualified `SELECT` resolves on the read-only endpoint — probed 2026-09-13, 201.

One case has no route through the editor and is accepted rather than solved: a table whose SELECT
privilege has been revoked from `supabase_read_only_user` answers 42501 on the read path, and only
25006 opens the write endpoint. Offering "run it as postgres anyway" would turn the confirm from a
question about a refused write into a way around a permission, which is worse than the gap.

## What was built, where it differs from the plan

- The run flow lives in `lib/sql-editor-actions.ts` (`"use server"`), not a `server-only` module plus
  a wrapper. It follows `write-actions.ts` / `ddl-actions.ts`: the logic and the action are the same
  module, and `resolveProject` is the authorisation gate.
- `recordWrite` grew optional `schema` and `table`. An arbitrary statement has no single table to
  name, and passing an invented one would have put fake values in the audit trail. Existing callers
  pass both, so their `detail` strings are byte-identical.
- `@codemirror/lint` was added to the four planned packages. `setDiagnostics` gives the underline and
  its hover message in one call, which is less code than a hand-built decoration field — and pnpm
  will not resolve a transitive dependency, so it has to be declared.
- Versions installed, all current at 2026-09-12: `codemirror` 6.0.2, `@codemirror/view` 6.43.11,
  `@codemirror/state` 6.7.4, `@codemirror/lang-sql` 6.10.0, `@codemirror/lint` 6.9.7.
- The editor is uncontrolled — it owns the document and reports it through `onChange`. Re-creating
  the state per keystroke would drop the selection, the undo history and the scroll position.
- `Mod-Enter` needs `Prec.highest`: `basicSetup`'s default keymap binds it to `insertBlankLine`.
- No pane splitter. The original has a draggable one; a fixed 45/55 split is the smaller thing that
  works, and nothing measured says the split is wrong yet.

## Review findings, and what came of them

Reviewed 2026-09-13. Two High, four Medium, six Low. Fixed in this phase:

- **The confirm sent whatever was in the editor, not the statement Postgres refused.** The editor
  stays typeable during a run, so typing through the round trip sent an unvetted statement straight
  to the write endpoint while the dialog said it had been refused by a read-only transaction. The
  refused statement is now held in state (`confirming: string | null`) and that is what is shown and
  what is resent.
- **A refusal left the previous rows on screen**, so cancelling looked like the statement had run.
  The result is cleared when the confirm opens.
- **`LINE n` was counted against a trimmed statement and applied to an untrimmed document**, so
  leading blank lines or indentation underlined the wrong place. The document is sent as it is;
  `.trim()` is only a guard against running nothing.
- **A rejected action showed nothing at all** — an expired session left the page unchanged, right
  after the user had clicked "Run write". `runSql` is now awaited inside a try/catch that renders
  the failure.
- **Password literals reached the audit trail.** `connection_events` has `select` and `insert`
  policies and nothing else, so a recorded secret cannot be deleted, and `/settings` renders
  `detail` verbatim. This is the first path in the app that can run `alter user … password '…'`.
  `lib/sql-redact.ts` removes the literal — tested, including the doubled-quote case — and the
  failure message is redacted too, since a syntax error quotes the fragment it choked on.
- **A position inside a function body is no longer underlined.** PL/pgSQL reports `LINE n` under a
  `QUERY:` line, counting lines of the function, not of the document.
- **`recordWrite`'s schema and table are bound together** as a pair rather than two independent
  optionals, so a caller cannot pass one and silently lose the target from the audit line.
- Results are memoised, and the panels dim while a run is in flight rather than only the grid.

**The read-only probe does not reject unqualified references — measured, not argued.** The review's
second High was that sending every statement to the read-only endpoint would break
`select * from todos`, because `lib/mgmt-api.ts` claimed the endpoint "rejects unqualified entity
references". Probed 2026-09-13: `search_path` there is `"$user", public`, and `select count(*)` on a
public table by bare name answers 201. The comment was wrong and has been corrected in place with
the measurement. `scripts/probe-query-errors.mjs` now carries both probes so the claim stays
checkable.

Left alone, deliberately: a result set with duplicate column names loses one (the endpoint returns
JSON objects, so the keys collapse before this code sees them, and it returns no column metadata to
work from).

## The editor looked wrong, and Monaco was not the reason

Raised 2026-09-14: the editor did not fit the app. It had a white stripe down the left and a pale
blue bar across the active line, and the question asked was whether to switch to Monaco.

**It was never the choice of editor.** `editor.tsx` passed CodeMirror a theme that set only height
and font, and no `{ dark: true }`. Without that flag CodeMirror applies its `&light` rules, which are
in `@codemirror/view` verbatim:

```
.cm-gutters       backgroundColor: "#f5f5f5"
&light .cm-activeLine  backgroundColor: "#cceeff44"
```

On `--background: #121212` that is exactly what was on screen. `basicSetup` also ships
`defaultHighlightStyle`, which is tuned for a light background, so the syntax colours were off for
the same reason.

Monaco was re-checked rather than waved away, 2026-09-14: `monaco-editor` 0.56.0, published
2026-07-20, **97.9 MB unpacked**, plus `@monaco-editor/react` 4.7.0 which loads Monaco from a CDN by
default — this app has no runtime CDN dependency — and needs web workers wired into Next. It also
ships `vs-dark`, which is *a* dark theme but not this app's palette, so it would have needed a custom
theme too. Switching would have paid a large dependency for a default that still had to be replaced,
and would have meant rebuilding the error underlining, the shortcut, the placeholder and the dynamic
import. Declined again, on numbers.

What was built instead is `components/sql-editor/editor-theme.ts`: surfaces mapped to the app's own
tokens (`--card`, `--border`, `--muted`, `--primary`, `--color-subtle`) and a `HighlightStyle` whose
colours were read out of the installed `github-dark-default` — the theme `lib/highlight.ts` already
gives Shiki — so SQL reads the same here as in the table editor's Definition tab. The highlighting
goes *before* `basicSetup`, because in CodeMirror the earlier extension wins.

`@codemirror/language` 6.12.4 and `@lezer/highlight` 1.2.3 are now declared rather than borrowed:
both were already present as transitive dependencies, and pnpm will not resolve those.

Measured after: the editor chunk is still 424 KB and still absent from every route's first load; the
route's first load is unchanged. **Not verified by eye — that needs the app.**

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
