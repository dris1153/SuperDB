---
title: "Table Editor (read-only, full fidelity)"
status: completed
created: 2026-08-29
blockedBy: []
blocks: []
---

# Table Editor

Fill the `tables` nav slug at `/p/[ref]/tables` — browse rows of any table in any connected project,
mirroring Supabase's own Table Editor. Read-only: no DML, no DDL.

Design, rejected alternatives, and the live API probe that backs them:
[brainstorm-report.md](reports/brainstorm-report.md). **Read it before starting** — it records what
the Management API's query role can and cannot do, measured rather than assumed.

## Phases

| # | Phase | Status | Delivers |
|---|---|---|---|
| 01 | [Reading core](phase-01-reading-core.md) | **completed** 2026-08-29 | Working table browser: sidebar, grid, pagination |
| 02 | [Editor chrome](phase-02-editor-chrome.md) | **completed** 2026-08-29 | Tab bar, toolbar, filters, RLS panel, row expand |
| 03 | [Definition tab](phase-03-definition-tab.md) | **completed** 2026-08-30 | Synthesised `CREATE TABLE` DDL |

P1 ships alone and is the bulk of the value. P2 makes it match the screenshot. P3 is last because it
is the least bounded piece.

## Settled constraints

These came out of the probe on 2026-08-29 and are not open for re-litigation:

- **Query role is `supabase_read_only_user`** with `rolbypassrls = true`. Every row of every table is
  readable, RLS or not. The grid is therefore *not* RLS-filtered — say so in the UI.
- **Role switcher is impossible.** The role is a member of no other role (`pg_has_role` false for
  `postgres`, `authenticated`, `anon`, `service_role`, `authenticator`); `set local role` returns
  `42501`. Drop the control entirely — do not render it disabled. Same reasoning
  `components/project-nav.tsx` applies to `Integrations`.
- **Multi-statement SQL is accepted but only the last result set is returned.** Anything needing
  several result sets needs several round-trips, or must be folded into one statement.
- **No bind parameters.** `POST /database/query/read-only` takes a SQL string. Identifiers must go
  through `quoteIdent`; integers through `clampInt`. This is why read-only was chosen.
- **`pg_get_constraintdef` / `pg_get_indexdef` are reachable**, so P3 is viable.

## Key dependencies

| Dependency | Note |
|---|---|
| `react-data-grid@7.0.0-beta.61` | **Pin exact, no caret.** Supabase Studio pins `beta.47`. Last non-prerelease is `6.1.0` from 2019 — the 7.x beta line is the maintained mainline. |
| `lib/mgmt-api.ts::readOnlyQuery` | Existing. Rejects unqualified entity references — schema-qualify everything. |
| `lib/db-introspect.ts::HIDDEN` | Export it and reuse for the schema list. Already keeps `auth`/`storage`, which is what the dropdown wants. |
| `lib/highlight.ts` | P3 only: add `"sql"` to the `Lang` union and `LANGS` array. One line. |
| `lib/safe.ts` | `safe()` / `attempt()` for every Management API call, matching the Database page. |

## Conventions to honour

- Files under 200 lines (repo rule). `components/table-editor/grid.tsx` is the likeliest to bloat.
- Pure functions get a `node:test` file next to them, run by `pnpm test`.
- Header comment on every non-trivial file explaining *why*, matching the surrounding code.
- Server Components fetch; client components are interactive leaves. No client data fetching.
- Every URL write wrapped in `useTransition` — the app has no `loading.tsx` anywhere, so navigation
  without a pending state visibly freezes.

## Definition of done

`tables` flips to `ready: true` in `components/project-nav.tsx`, `pnpm typecheck` is clean, and
`pnpm test` passes with the new `sql-ident` tests alongside the existing 60.
