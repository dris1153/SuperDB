# Deploying the schema

This app keeps its own data — connections, their encrypted secrets, the audit trail, saved queries —
in a Supabase project of its own, separate from every project a user connects to.
[`supabase/schema.sql`](../supabase/schema.sql) is that database, as one file.

There is no migration runner. The file is pasted into the SQL editor of the SuperDB project and run.

## It is safe to re-run

Every statement is guarded: `create table if not exists`, `add column if not exists`,
`create or replace function`, and converge blocks that backfill only rows that have nothing. Running
it on a populated database is meant to change nothing at all — the `sort_order` backfill, for
instance, numbers only rows that have no order yet, so it never renumbers one somebody chose.

That property is what makes it the migration path as well as the schema: after pulling changes,
paste the whole file again.

## The code can be ahead of the database

Because deployment is manual, the repository can carry tables the running database does not have.
This project has been in that state: `project_order`, `project_secrets` and `saved_queries` all
arrived in the file after it was last applied.

The symptom is one feature answering with a deployment message rather than data. `lib/project-parts.ts`
turns the Postgres error into a sentence deliberately, because `relation "public.saved_queries" does
not exist` is a fact about deployment rather than something the reader can act on:

```
Saved queries are unavailable on this instance.
```

If a feature reports something like that, the schema is behind — not the code.

## What should be there

Run this in the SQL editor of the SuperDB project. It names everything the app expects and says what
is missing, so it is also the check after a deploy.

```sql
with expected(kind, name) as (
  values
    ('table', 'connections'), ('table', 'connection_events'), ('table', 'vault'),
    ('table', 'connection_secrets'), ('table', 'project_order'),
    ('table', 'project_secrets'), ('table', 'saved_queries'),
    ('function', 'delete_own_account'), ('function', 'reorder_connections'),
    ('function', 'reorder_projects')
)
select e.kind, e.name,
       case when e.kind = 'table'
            then exists (select 1 from information_schema.tables
                          where table_schema = 'public' and table_name = e.name)
            else exists (select 1 from information_schema.routines
                          where routine_schema = 'public' and routine_name = e.name)
       end as present
from expected e
order by present, e.kind, e.name;
```

Then the columns that arrived later than their table, which a `create table if not exists` will not
add on its own — this is the failure the converge blocks exist for:

```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'connections'
  and column_name in ('display_name', 'tags', 'sort_order');
```

Three rows is right. Fewer means the file has not been re-run since those columns were added.

## Row level security is not optional here

Every table in that file carries `enable row level security` and a policy keyed on `auth.uid()`.
This database holds other people's encrypted project credentials; a table reaching the app without
its policy is the one deployment mistake with a consequence beyond a broken page. The check above
deliberately does not assert policies — verify them in the dashboard, or with:

```sql
select tablename, policyname from pg_policies where schemaname = 'public' order by tablename;
```

Eight policies across seven tables, as the file writes them.
