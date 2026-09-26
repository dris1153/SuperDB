import "server-only";
import { readOnlyQuery } from "./mgmt-api";

// Supabase plumbing schemas — noise in a schema picker. `auth` and `storage` stay: people read them.
export const HIDDEN = [
  "pg_catalog", "information_schema", "pg_toast", "extensions", "graphql", "graphql_public",
  "net", "pgsodium", "pgsodium_masks", "vault", "cron", "pgbouncer", "realtime", "_realtime",
  "supabase_functions", "supabase_migrations",
];

export type DbOverview = { db_bytes: number; connections: number; max_connections: number };

// backend_type filters out the background workers — checkpointer, walwriter, autovacuum launcher and
// friends — which pg_stat_activity also lists. Counting them inflates the number by roughly eight and
// does not match what anyone means by "connections".
const OVERVIEW_SQL = `
select
  pg_catalog.pg_database_size(pg_catalog.current_database())::bigint as db_bytes,
  (select count(*) from pg_catalog.pg_stat_activity
    where backend_type = 'client backend')::int as connections,
  (select setting::int from pg_catalog.pg_settings where name = 'max_connections') as max_connections;`;

export async function dbOverview(token: string, ref: string): Promise<DbOverview | null> {
  const rows = await readOnlyQuery<DbOverview>(token, ref, OVERVIEW_SQL);
  return rows[0] ?? null;
}
