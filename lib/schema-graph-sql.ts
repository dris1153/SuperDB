import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import { readSchemaGraph, type SchemaGraph } from "./schema-graph";

/**
 * A schema's whole graph in one statement, answered as one JSON document.
 *
 * Measured 2026-09-26 on SuperDB: `public` 8 tables and 9 keys in 2.4 s, `auth` 27 and 24 in 2.0 s —
 * the time is the endpoint's, not the catalog's. `typname` is the original's type label (`int8`,
 * `timestamptz`, `_text`, an enum's own name). `unique` is a single-column unique constraint, the
 * original's rule; a unique index alone does not count. Partition children are left out, as the
 * Table Editor's list leaves them out.
 */
const graphSql = (schema: string) => `
with t as (
  select c.oid, c.relname::text as name, pg_catalog.obj_description(c.oid, 'pg_class') as comment
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = ${quoteLiteral(schema)} and c.relkind in ('r', 'p') and not c.relispartition
)
select json_build_object(
  'tables', coalesce((
    select json_agg(json_build_object(
      'name', t.name,
      'comment', t.comment,
      'columns', (
        select coalesce(json_agg(json_build_object(
          'name', a.attname::text,
          'format', ty.typname::text,
          'nullable', not a.attnotnull,
          'identity', a.attidentity <> '',
          'primary', exists (select 1 from pg_catalog.pg_constraint k
                             where k.conrelid = t.oid and k.contype = 'p' and a.attnum = any (k.conkey)),
          'unique', exists (select 1 from pg_catalog.pg_constraint k
                            where k.conrelid = t.oid and k.contype = 'u' and k.conkey = array[a.attnum])
        ) order by a.attnum), '[]')
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_type ty on ty.oid = a.atttypid
        where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
      )
    ) order by t.name)
    from t
  ), '[]'),
  'relationships', coalesce((
    select json_agg(json_build_object(
      'id', k.oid::text || ':' || s.ord,
      'source_table', src.relname::text,
      'source_column', sa.attname::text,
      'target_schema', tn.nspname::text,
      'target_table', tgt.relname::text,
      'target_column', ta.attname::text
    ) order by k.oid, s.ord)
    from pg_catalog.pg_constraint k
    join t on t.oid = k.conrelid
    cross join lateral unnest(k.conkey, k.confkey) with ordinality as s(src_att, dst_att, ord)
    join pg_catalog.pg_class src on src.oid = k.conrelid
    join pg_catalog.pg_attribute sa on sa.attrelid = k.conrelid and sa.attnum = s.src_att
    join pg_catalog.pg_class tgt on tgt.oid = k.confrelid
    join pg_catalog.pg_namespace tn on tn.oid = tgt.relnamespace
    join pg_catalog.pg_attribute ta on ta.attrelid = k.confrelid and ta.attnum = s.dst_att
    where k.contype = 'f'
  ), '[]')
) as graph;`;

export async function readGraph(token: string, ref: string, schema: string): Promise<SchemaGraph> {
  const rows = await readOnlyQuery<{ graph: unknown }>(token, ref, graphSql(schema));
  return readSchemaGraph(rows[0]?.graph);
}
