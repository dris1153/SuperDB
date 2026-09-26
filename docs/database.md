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
