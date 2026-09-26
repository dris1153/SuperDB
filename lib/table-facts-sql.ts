import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import { readTableFacts, type TableFacts } from "./ddl-table-statements";

/** One ordinary or partitioned table's facts for Edit and Duplicate; null when there is no such table. */
const factsSql = (schema: string, table: string) => `
set local search_path = '';
select json_build_object(
  'foreignKeys', coalesce((select json_agg(pg_catalog.pg_get_constraintdef(k.oid) order by k.conname)
                           from pg_catalog.pg_constraint k where k.conrelid = c.oid and k.contype = 'f'), '[]'),
  'insertColumns', coalesce((select json_agg(a.attname::text order by a.attnum)
                             from pg_catalog.pg_attribute a
                             where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                               and a.attgenerated = ''), '[]'),
  'identityColumns', coalesce((select json_agg(a.attname::text order by a.attnum)
                               from pg_catalog.pg_attribute a
                               where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                                 and a.attidentity <> ''), '[]'),
  'rls', c.relrowsecurity,
  'comment', pg_catalog.obj_description(c.oid, 'pg_class'),
  'realtime', exists (select 1 from pg_catalog.pg_publication_tables pt
                      where pt.pubname = 'supabase_realtime' and pt.schemaname = n.nspname
                        and pt.tablename = c.relname)
) as facts
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = ${quoteLiteral(schema)} and c.relname = ${quoteLiteral(table)} and c.relkind in ('r', 'p');`;

export async function tableFacts(token: string, ref: string, schema: string, table: string): Promise<TableFacts | null> {
  const rows = await readOnlyQuery<{ facts: unknown }>(token, ref, factsSql(schema, table));
  return readTableFacts(rows[0]?.facts);
}
