# The Table Editor

Browsing, editing and altering a connected project's tables. This is the durable view: what the
subsystem is, how it is laid out, and why the safety model has the shape it does. The blow-by-blow —
what each phase decided and what it deviated from — lives in `plans/260829-2223-table-editor-readonly`
and `plans/260830-0045-table-editor-writes`, and is not repeated here.

Everything measured against a live database is in
[table-editor-measurements.md](./table-editor-measurements.md). Those facts cost real probing, and
several of them are counter-intuitive enough that the code would look wrong without them.

## The constraint everything follows from

Supabase's Management API exposes two SQL endpoints and **no bind parameters**. Both take a query as
text:

- `POST /v1/projects/{ref}/database/query/read-only` runs as `supabase_read_only_user`, which has
  `rolbypassrls`. Every read in the editor uses it, and it refuses a write outright.
- `POST /v1/projects/{ref}/database/query` runs as **`postgres`**: full DDL rights, RLS bypassed, any
  schema including `auth` and `storage`. Every write uses it.

So each value, name and type reaching a statement is interpolated into a string. There is no
parameter binding to fall back on, and the role doing the interpolating can do anything.

## Three kinds of input, three disciplines

**Values never appear in the SQL as values.** All of them travel as *one* JSON literal, dollar-quoted
with a randomly generated tag, and Postgres unpacks it with `jsonb_to_record` / `jsonb_to_recordset`
using each column's real type read from the catalog:

```sql
insert into "public"."t" ("name", "meta")
select "name", "meta"
from jsonb_to_recordset($sdb7f3a91c2e$[{"name":"…","meta":{"a":1}}]$sdb7f3a91c2e$::jsonb)
  as x("name" text, "meta" jsonb)
returning "id";
```

`JSON.stringify` is a well-tested encoder, and the payload crosses into SQL at exactly one boundary
whose safety is a single checkable property: **the tag does not occur in the encoded string**. It is
generated *and then verified* in `jsonLiteral` (`lib/sql-write.ts`), regenerating until it does not
collide — a tag generated but never checked is a bug that hides in testing. Types are coerced by
Postgres after unpacking rather than guessed in JavaScript.

**Names cannot travel as data, because they are grammar.** A table or column name goes through
`quoteIdent` (`lib/sql-ident.ts`), whose only escape is doubling an interior quote. It is *not*
idempotent — quoting twice produces a different, wrong identifier — so it is applied once, at the
point of interpolation. Quoting is not only injection defence here: unquoted, `MyTable` folds to
lowercase and `order` is a syntax error.

**Type names cannot be quoted safely at all.** An unknown type name in quotes is still an unknown
type name, so they are matched against a list read from the project's own `pg_type` at request time
(`lib/ddl-types.ts`) and refused if absent. The list covers `pg_catalog`, `public` and `extensions` —
the three schemas a bare type name can resolve to on the write role's `search_path` — deduplicated
with `pg_catalog` first, which is the order the resolver itself uses.

**Default expressions are executable by design** and cannot be escaped. The new-table sheet offers
a fixed list or a value it quotes (`ColumnDefault` in `lib/ddl-build.ts`). The column panel uses the
original's rule instead (`lib/column-statements.ts`): a value in brackets runs as written, anything
else is quoted as a literal — and the statement is shown in full before it runs either way.

**The column panel** (`column-panel.tsx`) is the original's, for adding and editing alike: General,
Data Type, Foreign Keys, Constraints. Data Privacy is left out — a dashboard-side masking flag with
no Postgres object and no Management API endpoint behind it. The server re-reads the column
(`column-facts-sql.ts`, with `search_path` emptied so every reference comes back qualified) and
rebuilds the statement from what the catalog says then. Measured on a scratch project, 2026-09-26:

- **One `alter table` is atomic, and so is the whole request.** A `set not null` with a CHECK the
  rows fail and a comment after it: nothing of it landed.
- **An identity needs `not null` first** — `must be declared NOT NULL before identity can be added`
  — so the panel sets it, and the builder orders it before the identity. A new identity's sequence
  starts at 1 over rows that already hold values; the next insert took 1 beside an existing 1, so the
  sequence is moved past the maximum in the same request.
- A primary key toggled on a table that has one is `drop constraint` and `add primary key` with the
  new set, in one statement: `(a)` → `(a, b)` → `(b)`, each applied.
- Adding a column with a constant default **and** unique to a table with rows fails with a duplicate
  key — every row gets the same default. Postgres says so; the panel does not pre-empt it.
- Constraints spanning several columns are not the panel's to edit; it counts them and says so.

## Preview, confirm, execute, record

Supabase's own dashboard writes on submit. SuperDB does not, because it shows several projects at
once and writing to the wrong one is a mistake with no undo — a risk a single-project dashboard does
not have.

1. **Preview.** `previewAffected` (`lib/table-writes.ts`) runs `select count(*)` over the *same*
   predicate the write will use, on the **read-only** endpoint, which cannot commit even if the
   predicate is wrong.
2. **Confirm.** One dialog for row writes (`write-confirm.tsx`) and one for schema changes
   (`ddl-confirm.tsx`). Both name the **project first**, then schema and table, then what will
   happen, then that there is no undo. `auth` and `storage` add a step: type the table name. Not a
   block — repairing one broken `auth.users` row is a legitimate thing to need — but enough friction
   that it cannot happen by reflex.
3. **Execute.** `execute` posts the statement and counts what `RETURNING` handed back. The endpoint
   reports nothing of its own: a successful `UPDATE` without `RETURNING` answers `[]`, which is
   indistinguishable from one that matched nothing. A response that is not an array throws rather
   than reporting zero, because "no idea what happened" must not read as a number.
4. **Record.** `recordWrite` (`lib/write-audit.ts`) appends to `connection_events` — including
   failures, since a request can time out after the server has committed. It never throws: it runs
   *after* a statement has committed, so letting a failed audit write decide the result would report
   a successful `drop table` as a failure and send the user to try it again.

The confirmed count is re-checked inside the write action against the same keys, and the write is
refused if the table has moved on. That is what makes "no write without a preview the user confirmed"
a property of the layer rather than a habit of the UI.

## What is deliberately not protected

- **Cascades and triggers are invisible to both the count and `RETURNING`.** Deleting one row can
  remove thousands elsewhere while the dialog says "1 row". The confirmation therefore lists the
  tables whose foreign keys point *at* this one (`incomingRefs`), because naming them is what changes
  a decision; an exact count is not needed for that.
- **No optimistic concurrency control.** An update matches on the primary key alone, so it lands on
  whatever the row has become since it was read. Normal editor behaviour, recorded as a decision
  rather than left as an omission; the dialog says so.
- **No undo.** The audit trail records what happened; it does not reverse it.

## Layout

**`lib/` — no UI, no browser, testable on its own.**

| Module | Holds |
|---|---|
| `sql-ident.ts` | `quoteIdent`, `quoteQualified`, `quoteLiteral`, `clampInt` |
| `sql-write.ts` | The primitives: `jsonLiteral`, `recordList`, `rejectTruncated`, `rejectGenerated`, `checkKnown`, `primaryKey`, `returningKey`, and the `Statement` type `execute` will only accept |
| `sql-statements.ts` | `buildInsert`, `buildUpdate`, `buildDelete`, `buildCount` |
| `ddl-build.ts` | DDL pieces: `checkName`, `checkType`, `defaultClause`, `columnClause`, and the `NewColumn` / `ColumnChange` / `ColumnDefault` types |
| `ddl-statements.ts` | `createTable`, `addColumn`, `alterColumn`, `dropColumn`, `dropTable`, `setRls` |
| `ddl-types.ts` | `listTypes` — the allowlist query |
| `table-writes.ts` | `previewAffected`, `execute` |
| `write-actions.ts` | `"use server"`: `insertRows`, `updateRow`, `deleteRows`, `deleteImpact`, `countAffected` |
| `ddl-actions.ts` | `"use server"`: `createTable`, `addColumn`, `alterColumn`, `dropColumn`, `dropTable`, `setRls`, `listColumnTypes`, `columnUsage` |
| `write-audit.ts` | `recordWrite` — shared by both action modules, and deliberately *not* a server action |
| `csv-parse.ts` | `parseCsv` and the caps |
| `csv-import.ts` | `guessMapping`, `buildImportRows`, `batch` |
| `cell-value.ts` | `parseValue` — what a piece of typed text becomes for a given column |

The builders are pure, so the client imports the same ones to render a preview. Nothing the browser
composes is ever executed: the actions take *inputs* and rebuild the statement server-side, against a
catalog they read themselves.

**`components/table-editor/` — the UI.** The grid (`grid.tsx` with `column-model.tsx`,
`grid-banner.tsx`, `grid-overlays.tsx`), the two confirmation dialogs, the sheets that collect input
(`insert-sheet`, `column-panel`, `new-table-sheet`, `import-sheet`), and the
shared bits (`guarded-schema.tsx`, `value-input.tsx`, `type-picker.tsx`, `column-form.tsx`).

## CSV import is an insert, not a new path

Parsing happens in the browser; only parsed rows cross to the server, through the same `insertRows` a
single typed row uses. There is no import-specific SQL, and therefore no second construction to keep
safe. What `csv-import.ts` owns is everything *before* that: which CSV column feeds which table
column, and what a given piece of text should become.

Two details decide whether a file round-trips. `parseCsv` reports an unquoted empty field as `null`
and `""` as an empty string, which is the distinction `toCsv` writes — collapsing them would make an
export impossible to re-import unchanged. And an empty field is then settled by the column's *type*:
only a textual column can hold an empty string, so only there does that distinction survive.

Batches are separate requests and therefore separate transactions, so a failure partway leaves the
earlier batches committed. The report says which batch failed and how many rows were written before
it, rather than implying all-or-nothing.
