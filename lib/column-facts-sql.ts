import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import { readColumnFacts, type ColumnFacts } from "./column-facts";

/**
 * One column's facts and its table's primary key, for the column panel and for the server that runs
 * what the panel asks. `search_path` is emptied first so every expression and reference comes back
 * qualified — the same reason as the table facts read.
 */
const factsSql = (schema: string, table: string, column: string) => `
set local search_path = '';
with t as (
  select c.oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = ${quoteLiteral(schema)} and c.relname = ${quoteLiteral(table)} and c.relkind in ('r', 'p')
)
select json_build_object(
  'found', exists (select 1 from t),
  'columnCount', (select count(*) from pg_catalog.pg_attribute a join t on a.attrelid = t.oid
                  where a.attnum > 0 and not a.attisdropped)::int,
  'pkName', (select k.conname::text from pg_catalog.pg_constraint k join t on k.conrelid = t.oid where k.contype = 'p'),
  'pkColumns', coalesce((
    select json_agg(a.attname::text order by s.ord)
    from pg_catalog.pg_constraint k
    join t on k.conrelid = t.oid
    cross join lateral unnest(k.conkey) with ordinality as s(attnum, ord)
    join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = s.attnum
    where k.contype = 'p'), '[]'),
  'column', (
    select json_build_object(
      'name', a.attname::text,
      'type', case when ty.typcategory = 'A' then el.typname::text else ty.typname::text end,
      'array', ty.typcategory = 'A',
      'comment', pg_catalog.col_description(a.attrelid, a.attnum),
      'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
      'nullable', not a.attnotnull,
      'identity', a.attidentity <> '',
      'uniqueName', (select k.conname::text from pg_catalog.pg_constraint k
                     where k.conrelid = a.attrelid and k.contype = 'u' and k.conkey = array[a.attnum]
                     order by k.conname limit 1),
      'check', (select json_build_object('name', k.conname::text, 'expr', pg_catalog.pg_get_expr(k.conbin, k.conrelid))
                from pg_catalog.pg_constraint k
                where k.conrelid = a.attrelid and k.contype = 'c' and k.conkey = array[a.attnum]
                order by k.conname limit 1),
      'foreignKeys', coalesce((
        select json_agg(json_build_object(
          'name', k.conname::text, 'schema', tn.nspname::text, 'table', tc.relname::text,
          'column', ta.attname::text, 'onUpdate', k.confupdtype::text, 'onDelete', k.confdeltype::text
        ) order by k.conname)
        from pg_catalog.pg_constraint k
        join pg_catalog.pg_class tc on tc.oid = k.confrelid
        join pg_catalog.pg_namespace tn on tn.oid = tc.relnamespace
        join pg_catalog.pg_attribute ta on ta.attrelid = k.confrelid and ta.attnum = k.confkey[1]
        where k.conrelid = a.attrelid and k.contype = 'f' and k.conkey = array[a.attnum]), '[]'),
      'sharedConstraints', (select count(*) from pg_catalog.pg_constraint k
                            where k.conrelid = a.attrelid and k.contype in ('u', 'c', 'f')
                              and a.attnum = any (k.conkey) and pg_catalog.array_length(k.conkey, 1) > 1)::int
    )
    from t
    join pg_catalog.pg_attribute a on a.attrelid = t.oid
    join pg_catalog.pg_type ty on ty.oid = a.atttypid
    left join pg_catalog.pg_type el on el.oid = ty.typelem
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attname = ${quoteLiteral(column)} and a.attnum > 0 and not a.attisdropped)
) as facts;`;

export async function columnFacts(token: string, ref: string, schema: string, table: string, column: string): Promise<ColumnFacts> {
  const rows = await readOnlyQuery<{ facts: unknown }>(token, ref, factsSql(schema, table, column));
  return readColumnFacts(rows[0]?.facts);
}
