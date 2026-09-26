# Database

A section with its own nav, as the original has it, opening on the Schema Visualizer. Unbuilt rows
are greyed and name what they would read in `title`. `/database/tables` is the old dashboard's table
list, standing in until Tables is rebuilt against the original.

## Schema Visualizer

**One catalog statement per schema** (`lib/schema-graph-sql.ts`), answered as a single JSON document:
tables, columns with their flags, and foreign keys unnested into column pairs. Measured 2026-09-26
on SuperDB:

```
public  201  2415 ms   8 KB    8 tables,  9 relationships
auth    201  1991 ms  35 KB   27 tables, 24 relationships
```

The time is the endpoint's. `typname` is the original's type label (`int8`, `timestamptz`, `_text`,
an enum's own name). *Unique* is a single-column unique constraint — the original's rule, so a
unique index alone does not show the icon. Partition children are left out.

`lib/schema-graph.ts` turns that into nodes and edges without importing xyflow, and has the tests.
A key into another schema points at one small label node (`auth.users.id`) however many share it;
a two-column key is two edges; a key naming a column that is not there draws nothing.

**Node ids are table names**, not oids, so a table dropped and recreated keeps its place. Places
are saved per project and schema in `localStorage` (`superdb:schema-positions:{ref}:{schema}`) on
every drag. A table with no saved place goes in a small cascade above the rest rather than
re-running the layout over places somebody chose; *Auto layout* re-runs dagre (`LR`, `nodesep 25`,
`ranksep 50`, the original's) after a confirm, and clears the saved set.

**Copy as SQL** is `schemaDefinition` in `lib/table-ddl.ts`: the Table Editor's `CREATE TABLE`
reconstruction, run over every table of the schema in one statement because this endpoint returns
only the last result set. The quoted name is built in SQL now so one statement can cover a schema;
checked against SuperDB, the per-table output is unchanged and appears verbatim in the schema-wide
one. Per-table Copy as SQL reads the existing `definition` part. **Copy as Markdown** is the
original's format, built from the graph in the browser.

**Download** captures the whole graph, not the visible part: the viewport is re-framed around the
nodes' bounds for the capture. Node menus carry `data-export-hidden` and are filtered out.

`@xyflow/react`, `@dagrejs/dagre` and `html-to-image` load on this route only — after the build, the
xyflow chunk (237 KB) is referenced by the schemas page's client manifest and no other.

## Tables

**One catalog statement per schema** (`lib/schema-entities-sql.ts`) gives every row of the list, and
on SuperDB `public` its numbers matched the original's page exactly. Rows are
`pg_stat_get_live_tuples` — what pg-meta reads. **Not `reltuples`**: it answered `-1` for six of
eight tables that had never been analysed. Size is `pg_size_pretty`, so it reads `48 kB` as the
original does; realtime is membership of the `supabase_realtime` publication. Search and the Entity
Type filter run in the browser.

The columns page (`/database/tables/[table]?schema=`) is read only; a table that is not there says
so rather than showing an empty list.

**Edit and Duplicate** read the table's facts with `set local search_path = ''` first. Without it
`pg_get_constraintdef` leaves a referenced table unqualified whenever its schema is on the search
path — measured: `REFERENCES superdb_probe_parent(id)` — and a copy's foreign key would then depend
on the write session's search path matching the read's. Both statements go through `run` in
`lib/ddl-run.ts`: rebuilt on the server from the catalog as it is then, and audited.

Measured on ZKVault, 2026-09-26, through the app's own builders, then dropped:

- **Edit** — comment, `disable row level security`, `alter publication supabase_realtime add
  table`, and the rename, in one string with the rename last: all applied. `drop table` from the
  publication applied too.
- **Duplicate with data** — a source with an `always` identity, a stored generated column, a unique
  key, a foreign key, RLS, a comment and a policy. The copy had the 3 rows, the generated values
  recomputed, RLS on, the comment, the primary, unique and foreign keys, both indexes, **no policy**
  (as in the original, and the confirm says so), and the next insert took id 4 — the sequence had
  been moved past the copied maximum.

Not measured, but documented Postgres behaviour: a `serial` column's default still names the source's
sequence after `like … including all`, so the two tables share it. The original has the same
recipe and the same result; it is not worked around.

## Enumerated Types

`/database/types`, as the original lists them: one statement per schema (`pg_type` joined to
`pg_enum`, labels in `enumsortorder`). The column panel's *Create enum types* opens it in a new tab,
as the original does, so the panel and its draft stay where they were.

Create, update and delete go through `run` like every schema change. Postgres can add a value to an
enum but not remove or reorder one, so the update sheet locks existing values and only appends; the
create sheet orders them by drag, or by ArrowUp/ArrowDown on the grip. Measured on ZKVault,
2026-09-26, then dropped: a label with a quote survived as `it's ok`; two `add value`, a comment and
a rename in **one request** all applied (`add value` inside the endpoint's implicit transaction is
fine on these Postgres versions); `drop type` while a column used it answered `2BP01: cannot drop
type … because other objects depend on it`, which the confirm passes through.

## Functions

`/database/functions`, as the original lists them, from one `pg_proc` read per schema with
`search_path` emptied — so a type in a signature comes back qualified unless it is in `pg_catalog`,
and the text can be replayed into `create or replace` and `drop` meaning the same thing on the write
role's path. Extension-owned functions are left out. Search matches name and body; Return Type and
Security are `CheckboxFilter`s. No AI entries; *Client API docs* links out to the dashboard.

The panel is the original's. **Edit locks type, return type and arguments**, and the server
replaces with the catalog's own signature — `pg_get_function_arguments` and
`pg_get_function_result` — never the draft's; then renames; then moves schema, last. Drop uses the
identity arguments, so one overload is never mistaken for another. Types come from the catalog by
both `typname` and `format_type` name (`int4` and `integer`), languages from `pg_language`.

Measured on ZKVault, 2026-09-26, then dropped: a function, an overload of it and a procedure
created; the body — containing `$$` and `$function$` — read back byte for byte, because the quote
tag is chosen to be absent from it and **nothing is padded inside the quotes** (a first version put
a newline either side, which `prosrc` stored, so every save would have grown the body by two
lines); body, security and `search_path` replaced, renamed and moved to `extensions` in one
request, and the call answered 3; one overload dropped, the other kept. A stored config comes back
as SQL that sets it again: `search_path=""` is not SQL, so it is read as `''`, and other values as
literals, as `pg_dump` writes them.

## Policies

`/database/policies`, a card per table as the original draws it, from one read per schema: RLS,
policies (with `search_path` emptied, so an expression replays into `alter policy` meaning the same)
and the table's grants to `anon`, `authenticated` and `service_role` from `aclexplode(relacl)`. The
badges and the admonition line are the original's `getTableDataApiStatus`, ported with its wording:
fully granted means all three roles hold SELECT, INSERT, UPDATE and DELETE. On SuperDB `public`,
`anon` holds nothing and the other two everything, so every table reads *API Disabled* with the
custom-grants line — as the original's screenshot shows. `auth` and `storage` are *Locked*.

The editor is the original's frame: fixed lines read-only, the USING and WITH CHECK expressions
editable, and only the clauses a command takes — SELECT and DELETE read, INSERT writes, UPDATE and
ALL both. Edit locks table, command and behaviour, because `alter policy` changes only the name, the
roles and the expressions; the rename goes last. The original's eight general templates fill it.
Roles come from `pg_roles`; none selected is `public`, the keyword, never quoted.

Measured on ZKVault, 2026-09-26, then dropped: a policy for each command, one restrictive with two
roles; roles, both expressions and the name altered in one request; a drop. `pg_get_expr` gives an
expression back in one pair of brackets, `(( SELECT auth.uid() AS uid) = user_id)`, which the read
unwraps — only when the pair encloses the whole — so an untouched expression is not re-sent.
