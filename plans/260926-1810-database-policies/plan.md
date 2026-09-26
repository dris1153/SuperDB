---
title: "Database › Policies, against the original"
status: in-progress  # built and measured; the editor unclicked signed in
created: 2026-09-26
blockedBy: []
blocks: []
---

# Database › Policies, against the original

Read from the original's source: `Database/Policies/` — `PolicyTableRow` (and its utils, which
hold the Data API admonitions word for word), `PolicyEditorPanel`, `Policies.constants.ts` (the
templates).

| # | Phase | Status |
|---|---|---|
| 1 | The page: one read per schema, a card per table, badges, admonitions, RLS toggle, delete | in-progress |
| 2 | Statements, measured on ZKVault | **completed** |
| 3 | The editor panel: details, the SQL frame with editable expressions, templates | in-progress |

## Decisions

- **The editor as the original**: a `create policy …` frame whose fixed lines are read-only and
  whose USING / WITH CHECK expressions are CodeMirror fields, with the original's general templates
  beside it. No AI.
- **Data API status as the original**: the badge and the one-line admonition come from the table's
  grants to `anon`, `authenticated` and `service_role`, whether its schema is exposed, RLS and the
  policy count — the original's `getTableDataApiStatus`, ported.
- **Locked schemas** — `auth`, `storage` — show *Locked* and no actions, as the original does.
- **Edit locks table, command and behaviour**: `alter policy` can change a name, roles and the two
  expressions, nothing else. The rename goes last.
- Only the clauses a command takes are offered: SELECT and DELETE take USING, INSERT takes WITH
  CHECK, UPDATE and ALL take both.

## Phase 1 — the page

One read: every ordinary and partitioned table in the schema with its RLS flag, its policies
(name, command, roles, permissive, both expressions) and its grants, plus the role names for the
editor's picker. Whether the schema is exposed comes from the `schemas` part already read.

## Phase 2 — statements (`lib/policy-statements.ts` + test)

`create policy` / `alter policy` / `drop policy`. Roles from `pg_roles` (empty means `public`, the
keyword, never quoted). Expressions are SQL and are labelled so; the statement is shown before it
runs. Gate on ZKVault: each command, restrictive, a named role list, alter of each field and a
rename in one request, drop.

## Phase 3 — the editor

Name, Table, Behavior, Command, Target roles on the left; the SQL frame below; Templates on the
right, filtered to the chosen command as the original filters them.

## Success criteria

- [x] SuperDB `public` shows its tables with *API Disabled* and the custom-grants line, as the
      original's screenshot does.
- [ ] Create, edit and delete run as previewed and are audited.
- [x] A command shows only the clauses Postgres accepts for it.

## Built 2026-09-26

The gate ran on ZKVault through the app's own builders and was dropped after — see
`docs/database.md`. SuperDB's `public` policies (read only) were rendered in a throwaway route, the
page and the edit panel for `own events appendable`, and compared with the screenshot: the cards,
the *API Disabled* badges and the custom-grants line match. **Not clicked:** Create, Save, Delete and
the RLS toggle, signed in.
