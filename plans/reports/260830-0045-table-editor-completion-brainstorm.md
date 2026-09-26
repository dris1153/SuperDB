---
type: brainstorm-report
date: 2026-08-30
feature: Table Editor completion — polish and writes
status: approved
covers:
  - plans/260830-0045-table-editor-polish
  - plans/260830-0045-table-editor-writes
---

# Table Editor completion

Approved 2026-08-30. Follows `plans/260829-2223-table-editor-readonly`, which shipped a read-only
browser. This report covers what is still missing to match Supabase's own editor, split into two
independent plans.

Standalone rather than plan-scoped because it is the design for **both** plans; duplicating it into
each would guarantee the two copies drift.

## Problem

The read-only editor matches the screenshot's shape but not its function. Two different gaps:

- **Group A** — read-only features that exist in Supabase and not here. No new risk class.
- **Group B** — the editor is an *editor*; ours is a *browser*. Writing is the whole difference.

## Probe findings (2026-08-30)

Measured against a live project, not assumed. Two probes, both authorised.

### Read-only: the write construction

`jsonb_to_record` with a randomly-tagged dollar-quoted literal round-trips a hostile payload exactly:

```
x'; drop table bookmarks; --  $$ $sdb$ "q" \ ümlaut 🙂
```

came back as **data**, with `int4`, `boolean`, `timestamptz` and `null` all coerced correctly, and
`bookmarks` untouched. The tag-collision guard (regenerate while the encoded JSON contains the tag)
works.

### Write endpoint, using a self-created table dropped afterwards

| Question | Answer |
|---|---|
| Role | **`postgres`** — not `supabase_read_only_user`. Full DDL, bypasses RLS |
| `CREATE TABLE` | 201 |
| `INSERT` via `jsonb_to_recordset`, hostile payload | 201, stored as data |
| `UPDATE`, `DELETE` | 201 |
| `ALTER TABLE ADD/DROP COLUMN` | 201 |
| `DROP TABLE` | 201 |
| Affected row count | **Not reported.** Response is `[]` unless the statement uses `RETURNING` |
| `read_only: true` on a write | Blocked — `25006 cannot execute UPDATE in a read-only transaction` |
| `BEGIN` / `ROLLBACK` | Honoured |
| Multi-statement | Accepted, only the last result set returns (consistent with the earlier probe) |

Cleanup verified: probe table gone, `bookmarks` intact.

## Settled decisions

| Decision | Choice | Rejected |
|---|---|---|
| Group B scope | **DML + basic DDL** | DML only; DML + DDL + policy management |
| Write safety | **Strict: preview + confirm, plus an audit trail** | Supabase-like immediacy |
| `auth` / `storage` schemas | **Extra confirmation, not blocked** | Blocking writes outright |
| Plan shape | **Two independent plans** | One plan, eight sequential phases |

### Why not block `auth` / `storage`

Blocking makes the tool useless exactly when it is most needed — repairing one broken `auth.users`
row. The risk is real, so it is priced as friction rather than prohibition: an extra confirmation
step, and the project name visible in every write dialog.

### Why preview by counting, not by rolling back

`BEGIN … ROLLBACK` works, so a true dry run is possible. It is not worth it: multi-statement returns
only the last result set, so getting the affected count out of a rolled-back transaction needs
contortions. A plain `select count(*) … where <the same predicate>` on the **read-only** endpoint is
simpler, exactly as accurate, and cannot accidentally commit.

After confirmation, the write runs with `RETURNING` so the **real** affected count is known —
necessary because the endpoint otherwise reports nothing.

### Why DDL is a separate phase from DML

`jsonb_to_record` protects *values*. Table names, column names and data types are **identifiers and
type names**, which cannot be passed as JSON. DDL needs its own discipline: identifiers through
`quoteIdent`, and data types restricted to an allowlist read from `pg_type` rather than typed freely.
Different construction, different tests, different phase.

## Group A — what is missing, ranked by value

1. **Foreign-key navigation** — the `→` button inside a FK cell in the screenshot. The thing that
   makes browsing relational data actually work. Needs the referenced *column* (`confkey`), not just
   the referenced table, which is all `describeTable` returns today.
2. **Column header dropdown** — sort, freeze, hide, copy name. **This was step 7 of the read-only
   plan's phase 2 and was skipped without being recorded.** A1 pays that debt.
3. Export CSV / JSON — the natural output of a read-only tool.
4. Cell selection and copy — `react-data-grid` has `onCellCopy`; only `resizable` is enabled today.
5. Column reorder, pin, hide — rdg supports all three; needs somewhere to persist.
6. Sidebar collapse, table context menu, type/RLS filter, toolbar overflow menu.
7. Full-text search across columns.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | The write role is `postgres`: bypasses RLS, can write any schema, can drop tables | Preview + confirm on every write; extra confirmation for `auth`/`storage`; project name in every dialog |
| 2 | No undo. `connection_events` records what happened, it does not reverse it | Say so in the UI rather than letting users infer it |
| 3 | SuperDB shows several projects at once, so writing to the wrong one is a risk the single-project dashboard does not have | Project name and ref in every write confirmation |
| 4 | DDL cannot use the value-escaping construction | Separate phase, allowlisted type names, identifiers via `quoteIdent` |
| 5 | A2 and B2 both edit `components/table-editor/grid.tsx` | Not a logical dependency — but ship A before B, or expect conflicts |

## Success criteria

- Group A: every item above either built or explicitly recorded as dropped, with a reason.
- Group B: no write reaches the database without a preview the user confirmed; every write is
  recorded in `connection_events` with its real affected-row count; a hostile value in any field is
  stored as data, proven against a live table.
- Both: `tsc --noEmit` clean, tests pass, files under 200 lines.

## Next steps

1. `plans/260830-0045-table-editor-polish` — A1 through A4.
2. `plans/260830-0045-table-editor-writes` — B1 through B4.
3. Recommended order: A first. B is independent but touches the same grid files.

## Open questions

- Import CSV (B4) needs a column mapping UI; whether that is worth building or whether pasting TSV
  into a grid is enough has not been decided.
- Whether hidden/pinned column state should be per-browser (`sessionStorage`, like tabs) or shared
  through the URL has not been settled — A2 should pick one and say why.
