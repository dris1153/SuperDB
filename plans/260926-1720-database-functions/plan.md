---
title: "Database › Functions, against the original"
status: in-progress  # built and measured; the panel unclicked signed in
created: 2026-09-26
blockedBy: []
blocks: []
---

# Database › Functions, against the original

Read from the original's source: `Database/Functions/FunctionsList`, `CreateFunction`,
`Functions.utils.ts`.

| # | Phase | Status |
|---|---|---|
| 1 | The list: read, search, Return Type and Security filters, row menu | in-progress |
| 2 | Statements, measured on ZKVault | **completed** |
| 3 | The panel: create, edit, duplicate | in-progress |

## Decisions

- **No AI**: *Edit function with Assistant* and the Assistant button are left out, as the SQL
  editor's AI generation was.
- **Client API docs** links out to the function's RPC docs on the Supabase dashboard, with the
  external icon — only for `public` functions that are not triggers, as the original shows it.
- Search matches name and body, as the original's does (it uses a fuzzy index; a substring here).
- Filters reuse `CheckboxFilter`, built for the original's filter popovers on OAuth Apps.

## Phase 1 — the list

One read per schema from `pg_proc`, with `search_path` emptied so every type in a signature comes
back qualified when it is not in `pg_catalog`: name, kind, `pg_get_function_arguments` (display and
replace), `pg_get_function_identity_arguments` (alter and drop), `pg_get_function_result`,
security, language, volatility, `proconfig`, `prosrc`. Extension-owned functions left out.

## Phase 2 — statements

`lib/function-statements.ts` (+ test):

- **Create** — `create function|procedure s.n(args) returns … language … volatility security …
  set … as $tag$ body $tag$`. Argument and return types from the catalog's list (plus `[]`, plus
  `void`, `record`, `trigger`, `event_trigger` for a return); language from `pg_language`; a
  config name must be an identifier, its value is SQL and says so.
- **Edit** — the original locks type, return type and arguments: a new signature is a new function.
  So: `create or replace` with the signature **read from the catalog**, then `rename`, then
  `set schema` last.
- **Drop** — by identity arguments, so an overload is never the wrong one.
- **The body is dollar-quoted with a tag it does not contain.**

Gate on ZKVault: create a function and a procedure; replace one's body, config and security; rename
and move it; drop both; a body containing `$$` and `$function$`.

## Phase 3 — the panel

Schema, Name, Type, Return type, Arguments, Definition (CodeMirror with SQL, the SQL editor's
theme, loaded on this route only), and *Show advanced settings*: Language, Behavior, Configuration
parameters, Type of Security. Edit locks Type, Return type and Arguments; Duplicate opens Create
with the function's fields and `<name>_duplicate`.

## Success criteria

- [x] SuperDB `public` lists its four functions as the original shows them.
- [ ] Create, edit, duplicate and delete run as previewed and are audited.
- [x] A body containing a dollar-quote tag survives a save unchanged.
- [x] Dropping one overload leaves the other.

## Built 2026-09-26

The gate ran on ZKVault through the app's own builders and was dropped after — `docs/database.md`
has the results. One thing it caught: padding the body with a newline inside the dollar quotes is
stored, so each save would have grown it; the quote is now tight. SuperDB's four `public`
functions (read only) and the edit panel for `delete_own_account` were rendered in a throwaway
route and compared with the screenshots. **Not clicked:** Create, Save, Duplicate and Delete signed in.
