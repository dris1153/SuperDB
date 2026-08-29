import "server-only";
import { readOnlyQuery } from "./mgmt-api";

// Supabase plumbing schemas — noise in an inventory view. `auth` and `storage` stay: their row
// counts are the most useful numbers on the page.
export const HIDDEN = [
  "pg_catalog", "information_schema", "pg_toast", "extensions", "graphql", "graphql_public",
  "net", "pgsodium", "pgsodium_masks", "vault", "cron", "pgbouncer", "realtime", "_realtime",
  "supabase_functions", "supabase_migrations",
];

export type TableRow = {
  schema: string;
  name: string;
  est_rows: number;
  total_bytes: number;
  columns: number;
  rls: boolean;
};

export type DbOverview = { db_bytes: number; connections: number; max_connections: number };

const TABLES_SQL = `
select
  n.nspname as schema,
  c.relname as name,
  c.reltuples::bigint as est_rows,
  pg_catalog.pg_total_relation_size(c.oid)::bigint as total_bytes,
  (select count(*) from pg_catalog.pg_attribute a
     where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)::int as columns,
  c.relrowsecurity as rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname not in (${HIDDEN.map((s) => `'${s}'`).join(", ")})
order by pg_catalog.pg_total_relation_size(c.oid) desc
limit 200;`;

// backend_type filters out the background workers — checkpointer, walwriter, autovacuum launcher and
// friends — which pg_stat_activity also lists. Counting them inflates the number by roughly eight and
// does not match what anyone means by "connections".
const OVERVIEW_SQL = `
select
  pg_catalog.pg_database_size(pg_catalog.current_database())::bigint as db_bytes,
  (select count(*) from pg_catalog.pg_stat_activity
    where backend_type = 'client backend')::int as connections,
  (select setting::int from pg_catalog.pg_settings where name = 'max_connections') as max_connections;`;

export const listTables = (token: string, ref: string) => readOnlyQuery<TableRow>(token, ref, TABLES_SQL);

export async function dbOverview(token: string, ref: string): Promise<DbOverview | null> {
  const rows = await readOnlyQuery<DbOverview>(token, ref, OVERVIEW_SQL);
  return rows[0] ?? null;
}
