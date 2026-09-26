import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import { readEntities, readTableColumns, type Entity, type TableColumn } from "./table-entities";

/**
 * One schema's relations for the Tables list.
 *
 * Measured 2026-09-26 on SuperDB `public`: the numbers match the original's page exactly. Rows are
 * `pg_stat_get_live_tuples`, what pg-meta reads — **not `reltuples`**, which answered `-1` for six of
 * the eight tables because they had never been analysed. Size is `pg_size_pretty`, so the unit reads
 * as the original's (`48 kB`). Realtime is membership of the `supabase_realtime` publication.
 */
const entitiesSql = (schema: string) => `
select c.relname::text as name,
       c.relkind::text as kind,
       pg_catalog.obj_description(c.oid, 'pg_class') as comment,
       (select count(*) from pg_catalog.pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)::int as columns,
       case when c.relkind in ('r', 'p', 'm') then pg_catalog.pg_stat_get_live_tuples(c.oid) end as rows,
       case when c.relkind in ('r', 'p', 'm')
            then pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) end as size,
       exists (select 1 from pg_catalog.pg_publication_tables pt
               where pt.pubname = 'supabase_realtime' and pt.schemaname = n.nspname
                 and pt.tablename = c.relname) as realtime
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = ${quoteLiteral(schema)}
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
  and not c.relispartition
order by c.relname;`;

export async function listEntities(token: string, ref: string, schema: string): Promise<Entity[]> {
  return readEntities(await readOnlyQuery(token, ref, entitiesSql(schema)));
}

/**
 * One relation's columns for the columns page, with whether it exists at all. The type is the
 * original's label: `typname`, with an array's leading underscore turned into `[]`.
 */
const columnsSql = (schema: string, table: string) => `
with t as (
  select c.oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = ${quoteLiteral(schema)} and c.relname = ${quoteLiteral(table)}
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
)
select json_build_object(
  'found', exists (select 1 from t),
  'columns', coalesce((
    select json_agg(json_build_object(
      'name', a.attname::text,
      'type', case when ty.typcategory = 'A' then pg_catalog.substr(ty.typname, 2) || '[]' else ty.typname::text end,
      'comment', pg_catalog.col_description(a.attrelid, a.attnum),
      'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
      'nullable', not a.attnotnull,
      'identity', a.attidentity <> '',
      'primary', exists (select 1 from pg_catalog.pg_constraint k
                         where k.conrelid = a.attrelid and k.contype = 'p' and a.attnum = any (k.conkey)),
      'foreign', exists (select 1 from pg_catalog.pg_constraint k
                         where k.conrelid = a.attrelid and k.contype = 'f' and a.attnum = any (k.conkey)),
      'unique', exists (select 1 from pg_catalog.pg_constraint k
                        where k.conrelid = a.attrelid and k.contype = 'u' and k.conkey = array[a.attnum])
    ) order by a.attnum)
    from t
    join pg_catalog.pg_attribute a on a.attrelid = t.oid
    join pg_catalog.pg_type ty on ty.oid = a.atttypid
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attnum > 0 and not a.attisdropped
  ), '[]')
) as result;`;

export async function listTableColumns(
  token: string,
  ref: string,
  schema: string,
  table: string,
): Promise<{ found: boolean; columns: TableColumn[] }> {
  const rows = await readOnlyQuery<{ result: unknown }>(token, ref, columnsSql(schema, table));
  return readTableColumns(rows[0]?.result);
}
