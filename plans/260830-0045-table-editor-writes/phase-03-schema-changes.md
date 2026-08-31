---
phase: 3
title: "Schema changes"
status: completed
priority: P2
effort: "2d"
dependencies: [1]
---

# Phase B3: Schema changes

## Overview

Basic DDL: create a table, add, alter and drop columns, and toggle row level security. Separate from
B2 because the safety construction that protects *values* does not protect *identifiers*.

## Requirements

**Functional**
- Create a table: name, columns with types, nullability, defaults, a primary key, and RLS on or off.
- Add a column, rename it, change its nullability or default, drop it.
- Toggle RLS on an existing table.
- Every operation previews the exact DDL and waits for confirmation.

**Non-functional**
- Type names come from an allowlist read from the catalog, never from free text.
- Identifiers go through `quoteIdent`; there is no other path into the statement.
- Destructive DDL — dropping a column, dropping a table — states what is lost and cannot be undone.

## Architecture

**`jsonb_to_record` cannot be used here.** Table names, column names and type names are identifiers
and type names, not values; they cannot travel as JSON and be unpacked. DDL therefore needs its own
discipline, and that is the whole reason this is a separate phase from B1 and B2:

| Input | Protection |
|---|---|
| Table and column names | `quoteIdent` — already tested |
| Type names | **Allowlist** built from `pg_type`, matched exactly. Never interpolated from user text |
| Default expressions | The hard case — see below |
| Nullability, primary key | Booleans and column lists; no free text |

### Default expressions are the unsolved part

A default is an arbitrary SQL expression: `now()`, `gen_random_uuid()`, `auth.uid()`, `nextval(...)`.
It cannot be escaped as a literal, because it is meant to be executed.

Two honest options, decide in this phase rather than drifting:

1. **Offer a fixed list** of common defaults per type (`now()`, `gen_random_uuid()`, `auth.uid()`,
   `true`, `false`, a literal value) and nothing else. Safe, covers most real use, and refuses the
   long tail.
2. **Allow free text**, clearly labelled as raw SQL, previewed in full before running, and let
   Postgres reject what is invalid. Honest, more capable, and accepts that a user typing SQL into a
   field marked "SQL" is not an injection — it is the feature.

Recommended: **(1) for the create-table form, (2) for editing an existing column**, where the person
is already looking at raw DDL in the definition tab.

## Related Code Files

**Create**
- `lib/ddl-build.ts`, `lib/ddl-build.test.ts`
- `lib/ddl-types.ts` — the allowlist and its catalog query
- `components/table-editor/new-table-sheet.tsx`
- `components/table-editor/column-edit-sheet.tsx`

**Modify**
- `lib/write-actions.ts` — `createTable`, `alterColumn`, `dropColumn`, `toggleRls`
- `components/table-editor/sidebar.tsx` — enable **New table**
- `components/table-editor/column-menu.tsx` — add Edit and Drop (from polish A1)
- `components/table-editor/rls-panel.tsx` — the RLS toggle

## Implementation Steps

### 1. Type allowlist

```sql
select t.typname::text as name
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
where n.nspname in ('pg_catalog', 'public') and t.typtype in ('b', 'e', 'd')
  and t.typname not like '\_%'
order by t.typname;
```

Present the common ones first — `text`, `int4`, `int8`, `bool`, `uuid`, `timestamptz`, `jsonb`,
`numeric` — with the rest behind a search. A chosen name is matched against this list before it
reaches SQL; anything not in it is refused, not quoted.

### 2. `lib/ddl-build.ts` — tests first

```ts
createTable(schema, name, columns, opts): string
addColumn(schema, table, column): string
alterColumn(schema, table, column, change): string
dropColumn(schema, table, column): string
setRls(schema, table, enabled): string
```

Tests before implementation:
- a table named `MyTable` and a column named `order` produce valid quoted DDL
- a type name not on the allowlist throws rather than being quoted into the statement
- an injection attempt in a column name ends up inside one quoted identifier
- `createTable` with no columns throws
- a primary key naming a column that is not in the list throws
- dropping the last column throws

### 3. Preview

DDL previews differently from DML: there is no affected-row count, so the preview **is** the statement.
Show the exact SQL, highlighted with the `sql` grammar already registered for the definition tab.

For `drop column`, add what is being lost — the column's type and, from a `count(*) where col is not
null`, how many rows currently hold a value. Dropping a column that holds data should not look the
same as dropping an empty one.

### 4. RLS toggle

`alter table … enable|disable row level security`. Turning RLS **off** on a table that has policies is
the dangerous direction — the policies remain but stop being enforced, so every row becomes visible to
every client. The confirmation must say that explicitly.

### 5. What is out of scope

Policy creation and editing. A policy body is an arbitrary SQL expression with no safe construction
available, and it was excluded when the scope was set. The RLS panel keeps listing policies read-only.

## Outcome

Built as planned. The default-expression question the phase left open was settled the way it
recommended: a fixed list on the create form, free SQL when editing an existing column — where the
field says it is run as written and the statement is shown in full before it runs.

**The plan's allowlist query returned nothing.** `t.typname not like '\_%'` reads correctly in the
plan but has to survive two levels of unescaping — the TypeScript template literal, then JSON — and
what reached Postgres was the pattern `_%`, which matches every name. The query now uses
`left(typname, 1) <> '_'` and contains no escape sequence at all. Chasing this also settled a
question the write layer never had to ask: the endpoint passes backslashes through **unchanged**, one
for one, in string literals and identifiers alike, so nothing needs a transport escape. An earlier
reading that suggested otherwise turned out to be the probe script's own escaping, not the API's.

### Deviations

**Identity columns were added to `NewColumn`.** The plan's column shape had no way to make an
auto-incrementing key, which would have left every new table uneditable by B2 — a row cannot be
addressed without a primary key. `generated by default as identity`, integer types only, and never
alongside a DEFAULT.

**No type modifiers.** `varchar(20)` and `numeric(10,2)` cannot be expressed; the picker offers the
bare type. A modifier means validating one more grammar, and `text` with unbounded `numeric` covers
what this editor is for. The definition tab still shows the real declared type.

**DDL lives in `ddl-actions.ts`, not `write-actions.ts`.** Both together would be past the repo's
200-line rule. The audit helper moved to `write-audit.ts` so the two share it — deliberately not a
server action, since a `"use server"` export would be callable from the browser with any text at all.
`ddl-build.ts` split into primitives and statements for the same reason, mirroring `sql-write.ts` and
`sql-statements.ts`.

**The preview is built by the code that will run it.** The client calls the same pure builders to
render the SQL, and the action rebuilds the statement server-side from the same inputs against a type
list read from the project's own catalog. Nothing the browser composed is executed — otherwise
"confirm this SQL" would mean "run whatever was posted".

`policyCount` was written and then removed: the RLS panel already holds the policy list, so the extra
round trip answered a question the caller could already see.

### Verified live

Against tables created and dropped on a real project, driven by the same builders the UI calls:

- `create table` with an identity primary key, a reserved word (`order`), a mixed-case name
  containing a space, an expression default (`now()`), a literal default containing quotes, and RLS
  enabled in the same request — `relrowsecurity` came back true and both defaults applied on insert.
- `add column`; a combined `alter` (type + not null + default) with the rename following as its own
  statement; a raw default on the renamed column; `drop column`; `drop table`; RLS off again.
- The two reads the dialogs depend on: the non-null count (3 rows, 2 filled) and the policy count,
  both against a quoted mixed-case table name.
- Postgres refusing `set not null` on a column that still holds nulls, with a message clear enough to
  surface unchanged — which is what this phase decided to do rather than pre-empt with a row count.

### Review findings and what was done

The review cleared the injection surface — every input reaches SQL through `quoteIdent`, the catalog
allowlist, or one of the three declared default kinds, and `kind: "raw"` is produced by exactly the
one sheet the plan permits — but found four defects on the no-undo path. Three probes settled the
open questions before any of it was changed.

**`checkName` counted code points; NAMEDATALEN is 63 bytes.** Measured: a 32-character CJK table name
(96 bytes) was created by Postgres as 21 characters, with only a NOTICE. The check let all 32
through, so the preview named a table that would not exist — breaking the one property this phase is
built on. Now measured with `TextEncoder`, with a test carrying the CJK name.

**The drop-column warning went silent when the count was unknown.** `columnUsage` returns null while
the count is in flight *and* whenever it fails, and the warning only rendered for a known non-zero.
A statement timeout on a large table therefore looked exactly like an empty column. Only a known zero
stays quiet now; null says so.

**A failing audit write could turn a committed change into a reported failure.** `recordEvent`
swallows its own errors but `createClient` and `getUser` do not, so a hiccup after a successful
`drop table` would surface as `ok: false` and send the user to try again. `recordWrite` can no longer
throw: it runs after the statement has committed, and it is not entitled to decide the outcome.

**A rejected server action left the dialog silent.** No `try/catch` around the three DDL calls, so a
dropped connection meant `setError` never ran and nothing said whether the statement had gone
through. Each now reports an outcome it cannot determine as exactly that.

Also taken: the allowlist missed `extensions`, which is in the write role's `search_path` and where
Supabase installs `citext` and `vector` — a shorter list than the database would accept; names are
now deduplicated with `pg_catalog` first, the order the resolver itself uses. `run()` no longer reads
the type list for `drop table`, `drop column` and the RLS toggle, so a throttled read endpoint cannot
block the three things most wanted when something is wrong. A stale error no longer survives into the
next confirmation. The new-table preview says it is still reading the type list instead of blaming
`int8` for a read that has not landed. The auto-increment switch is disabled on a non-integer type
rather than letting the builder throw into the footer. `addColumn` refuses a `primaryKey` column
instead of dropping the flag silently, and the Add column form hides the switch.

**Two server actions had no UI**, which also left a functional requirement unmet: Add column and
Delete table are now in the per-table menu, on ordinary tables only — a view needs `drop view` and
takes no columns, and this phase builds neither.

**One question the review raised is now answered rather than assumed.** Multi-statement atomicity was
load-bearing for `create table` + `enable row level security` and for `alter` + `rename`, and nothing
in the repo had established it. Measured: a request whose *first* statement renamed a column
successfully and whose second failed left the column unrenamed — the implicit transaction rolls the
whole request back. Both pairs are atomic; no `begin`/`commit` wrapper is needed.

## Success Criteria

- [x] `pnpm typecheck` clean; DDL builder tests pass (26), 212 in total; lint and build clean
- [x] Create a table on a live project, add a column, alter it, drop it, drop the table
- [x] A type name outside the allowlist is refused at build time
- [x] Mixed-case and reserved-word identifiers produce valid DDL
- [x] The drop-column confirmation reports how many rows hold a value
- [x] Disabling RLS warns that existing policies stop being enforced
- [x] Creating a table in `auth` requires the second confirmation
- [x] Add a column and delete a table, both from the per-table menu

The guarded-schema ones are read from the code rather than clicked through a browser: `DdlConfirm` is
the only path to a schema change and it always renders the guarded-schema step, which is now the same
hook the row writes use — including its refusal to accept an empty typed name against an empty table
name, which the create path can produce.

## Next Steps

A table with no primary key cannot have its schema changed from the grid, because the column menu's
Edit entry is gated on the same `editable` flag as row editing. So a keyless table cannot be given a
key here. New tables get an identity key by default, but an existing one has no route; the per-table
menu is where that would go.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Type names cannot be escaped | Allowlist from the catalog, matched exactly; anything else refused |
| Default expressions are executable by design | Fixed list on create; raw SQL only when explicitly labelled and previewed |
| Dropping a column loses data with no undo | Preview reports the non-null row count before confirming |
| Disabling RLS silently exposes every row | Stated in the confirmation, not left to be inferred |
| DDL runs as `postgres` on any schema | Second confirmation for `auth` and `storage` |
