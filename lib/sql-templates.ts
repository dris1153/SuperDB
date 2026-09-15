/**
 * The SQL editor's REFERENCE section: statements worth having to hand.
 *
 * Source, not a table. They do not vary per user or per project, so a table would be a migration
 * for content that belongs in version control — the same call `lib/framework-content/` makes about
 * the Connect sheet's snippets.
 *
 * **The examples have been run; the templates have only been parsed.** `scripts/probe-sql-templates.mjs`
 * sends each through the read-only endpoint against a live project. An example must answer 201 with
 * rows, which is a real execution. A template comes back refused with SQLSTATE 25006, and measuring
 * 2026-09-13 showed exactly how much that proves and how little:
 *
 * - A syntax error answers 42601 even inside a read-only transaction, so 25006 does prove the
 *   statement parses.
 * - `alter table <no such table>`, `create index on <no such table>`, and a default calling a
 *   function that does not exist all answer 25006 too: the refusal is by command tag, *before*
 *   names are resolved. So 25006 proves nothing about the objects a template names.
 * - `create policy` is the exception. On a missing table it answers 42P01, so that one template's
 *   relation reference is genuinely checked when the probe substitutes a real name.
 *
 * Verifying the rest would mean writing to someone's database. What can be checked instead is the
 * statements themselves, which is why they are kept short and ordinary.
 */

export type SqlSnippet = {
  id: string;
  title: string;
  /** One line. It says what the statement answers, not how it works. */
  about: string;
  sql: string;
};

/** Read-only. Each answers a question about this project as it is. */
export const SQL_EXAMPLES: SqlSnippet[] = [
  {
    id: "table-sizes",
    title: "Largest tables",
    about: "Total size on disk, including indexes and TOAST.",
    sql: `select n.nspname as schema,
       c.relname as table,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       nullif(c.reltuples, -1)::bigint as estimated_rows
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p')
   and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
 order by pg_total_relation_size(c.oid) desc
 limit 20;`,
  },
  {
    id: "database-size",
    title: "Database size and connections",
    about: "How much room is used, and how much of the connection limit.",
    sql: `select pg_size_pretty(pg_database_size(current_database())) as database_size,
       (select count(*) from pg_catalog.pg_stat_activity
         where backend_type = 'client backend') as client_connections,
       (select setting::int from pg_catalog.pg_settings
         where name = 'max_connections') as max_connections;`,
  },
  {
    id: "rls-status",
    title: "Tables without row level security",
    about: "Every table where RLS is off — the ones an exposed schema would serve to anyone.",
    // relkind 'p' as well as 'r': a partitioned parent with RLS off belongs on a security list.
    // The schema list is Supabase's own plumbing, which manages its own access — listing it buries
    // the tables the question is actually about.
    sql: `select n.nspname as schema, c.relname as table, c.relrowsecurity as rls_enabled
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p')
   and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage',
                         'vault', 'realtime', '_realtime', 'extensions', 'graphql',
                         'graphql_public', 'net', 'pgsodium', 'pgsodium_masks', 'cron',
                         'pgbouncer', 'supabase_functions', 'supabase_migrations')
   and not c.relrowsecurity
 order by n.nspname, c.relname
 limit 100;`,
  },
  {
    id: "policies",
    title: "Row level security policies",
    about: "What each policy allows or restricts, and to which roles.",
    sql: `select schemaname as schema, tablename as table, policyname as policy,
       cmd as command, permissive, roles, qual as using_expression, with_check
  from pg_catalog.pg_policies
 order by schemaname, tablename, policyname
 limit 200;`,
  },
  {
    id: "unused-indexes",
    title: "Indexes nothing reads",
    about: "Zero scans since the last statistics reset. They still cost every write.",
    // Unique indexes are excluded: enforcing uniqueness on insert does not count as a scan, so a
    // primary key on an insert-only table always looks unused. Dropping one loses the constraint,
    // not just the index.
    sql: `select s.schemaname as schema, s.relname as table, s.indexrelname as index,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size, s.idx_scan as scans
  from pg_catalog.pg_stat_user_indexes s
  join pg_catalog.pg_index i on i.indexrelid = s.indexrelid
 where s.idx_scan = 0
   and not i.indisunique
 order by pg_relation_size(s.indexrelid) desc
 limit 50;`,
  },
  {
    id: "sequential-scans",
    title: "Tables read by sequential scan",
    about: "More full scans than index scans usually means a missing index.",
    sql: `select schemaname as schema, relname as table,
       seq_scan as sequential_scans, idx_scan as index_scans,
       n_live_tup as live_rows
  from pg_catalog.pg_stat_user_tables
 where seq_scan > coalesce(idx_scan, 0)
 order by seq_scan desc
 limit 20;`,
  },
  {
    id: "extensions",
    title: "Installed extensions",
    about: "What is installed, and which version.",
    sql: `select e.extname as extension, e.extversion as version, n.nspname as schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
 order by e.extname;`,
  },
];

/**
 * Statements that write. They carry placeholders and are meant to be edited before running — the
 * editor's confirm still names the project, as it does for anything that writes.
 */
export const SQL_TEMPLATES: SqlSnippet[] = [
  {
    id: "create-table",
    title: "Create a table",
    about: "With a uuid key, timestamps, and row level security switched on.",
    sql: `create table public.your_table (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null
);

alter table public.your_table enable row level security;`,
  },
  {
    id: "add-column",
    title: "Add a column",
    about: "Nullable, so it does not rewrite the table or fail on existing rows.",
    sql: `alter table public.your_table
  add column your_column text;`,
  },
  {
    id: "create-index",
    title: "Create an index",
    about: "Locks the table against writes while it builds. Build a large one from psql instead.",
    // Not CONCURRENTLY: that cannot run inside a transaction block, and a concurrent build that
    // fails leaves an invalid index behind which still costs every write. psql is its place.
    sql: `create index if not exists your_table_your_column_idx
  on public.your_table (your_column);`,
  },
  {
    id: "own-rows-policy",
    title: "Policy: each user sees only their own rows",
    about: "Assumes a user_id column holding auth.uid(). Enables RLS, without which a policy does nothing.",
    // The enable is not padding: a policy on a table with RLS off is inert, and the table stays
    // readable by anyone the schema is exposed to. A security claim that fails silently.
    sql: `alter table public.your_table enable row level security;

create policy "own rows" on public.your_table
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());`,
  },
  {
    id: "foreign-key",
    title: "Add a foreign key",
    about: "Validates every existing row and locks both tables while it does. Cascade deletes children with the parent.",
    sql: `alter table public.your_table
  add constraint your_table_parent_fkey
  foreign key (your_column) references public.parent_table (id) on delete cascade;`,
  },
];

