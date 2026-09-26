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
