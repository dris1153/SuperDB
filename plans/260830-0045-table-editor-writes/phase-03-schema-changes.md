---
phase: 3
title: "Schema changes"
status: pending
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

## Success Criteria

- [ ] `pnpm typecheck` clean; `ddl-build` tests pass
- [ ] Create a table on a live project, add a column, alter it, drop it, drop the table
- [ ] A type name outside the allowlist is refused at build time
- [ ] Mixed-case and reserved-word identifiers produce valid DDL
- [ ] The drop-column confirmation reports how many rows hold a value
- [ ] Disabling RLS warns that existing policies stop being enforced
- [ ] Creating a table in `auth` requires the second confirmation

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Type names cannot be escaped | Allowlist from the catalog, matched exactly; anything else refused |
| Default expressions are executable by design | Fixed list on create; raw SQL only when explicitly labelled and previewed |
| Dropping a column loses data with no undo | Preview reports the non-null row count before confirming |
| Disabling RLS silently exposes every row | Stated in the confirmation, not left to be inferred |
| DDL runs as `postgres` on any schema | Second confirmation for `auth` and `storage` |
