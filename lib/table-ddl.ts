import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral, quoteQualified } from "./sql-ident";

/**
 * Reconstructs `CREATE TABLE` from the catalog.
 *
 * Postgres has no `pg_get_tabledef`, so the statement is assembled from `pg_attribute`,
 * `pg_get_constraintdef`, `pg_get_indexdef` and `pg_policy`. It is built entirely inside one SQL
 * statement because this endpoint returns only the **last** result set of a multi-statement request
 * — several catalog queries would mean several round trips.
 *
 * Views return their own body instead; a synthesised `CREATE TABLE` for a view would be fiction.
 */

/** Shapes whose full definition this cannot honestly reconstruct. */
const UNSUPPORTED = "unsupported";

export type TableDefinition = { ddl: string; complete: boolean };

const ddlSql = (schema: string, table: string) => {
  const qualified = quoteQualified(schema, table);
  const q = quoteLiteral(qualified);

  return `
select
  case
    when c.relkind in ('v', 'm') then
      'create ' || case when c.relkind = 'm' then 'materialized ' else '' end
      || 'view ' || ${q} || ' as' || E'\\n'
      || pg_catalog.pg_get_viewdef(c.oid, true)
    when c.relkind not in ('r', 'p') then '${UNSUPPORTED}'
    else
      'create table ' || ${q} || ' (' || E'\\n'
      || coalesce((
           select string_agg(
             '  ' || pg_catalog.quote_ident(a.attname) || ' '
             || pg_catalog.format_type(a.atttypid, a.atttypmod)
             || case
                  when a.attgenerated = 's' then
                    ' generated always as (' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '') || ') stored'
                  when a.attidentity in ('a', 'd') then
                    ' generated ' || case a.attidentity when 'a' then 'always' else 'by default' end
                    || ' as identity'
                  else coalesce(' default ' || pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
                end
             || case when a.attnotnull then ' not null' else '' end,
             E',\\n' order by a.attnum)
           from pg_catalog.pg_attribute a
           left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         ), '')
      || coalesce((
           select E',\\n' || string_agg(
             '  constraint ' || pg_catalog.quote_ident(k.conname) || ' '
             || pg_catalog.pg_get_constraintdef(k.oid),
             E',\\n' order by k.contype, k.conname)
           from pg_catalog.pg_constraint k
           where k.conrelid = c.oid and k.contype in ('p', 'u', 'f', 'c')
         ), '')
      || E'\\n);'
      -- Indexes that back a constraint are already printed as part of it.
      || coalesce((
           select E'\\n\\n' || string_agg(pg_catalog.pg_get_indexdef(i.indexrelid) || ';', E'\\n'
                                          order by ic.relname)
           from pg_catalog.pg_index i
           join pg_catalog.pg_class ic on ic.oid = i.indexrelid
           where i.indrelid = c.oid
             and not exists (select 1 from pg_catalog.pg_constraint k where k.conindid = i.indexrelid)
         ), '')
      || case when c.relrowsecurity
              then E'\\n\\nalter table ' || ${q} || ' enable row level security;' else '' end
      || coalesce((
           select E'\\n' || string_agg(
             'create policy ' || pg_catalog.quote_ident(p.polname) || ' on ' || ${q}
             || ' as ' || case when p.polpermissive then 'permissive' else 'restrictive' end
             || ' for ' || case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                                         when 'w' then 'update' when 'd' then 'delete'
                                         else 'all' end
             || ' to ' || case when 0 = any(p.polroles) then 'public'
                               else coalesce((select string_agg(pg_catalog.quote_ident(r.rolname), ', '
                                                                order by r.rolname)
                                              from pg_catalog.pg_roles r
                                              where r.oid = any(p.polroles)), 'public') end
             || coalesce(E'\\n  using (' || pg_catalog.pg_get_expr(p.polqual, p.polrelid) || ')', '')
             || coalesce(E'\\n  with check (' || pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) || ')', '')
             || ';',
             E'\\n' order by p.polname)
           from pg_catalog.pg_policy p where p.polrelid = c.oid
         ), '')
  end as ddl,
  c.relkind::text as kind
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = ${quoteLiteral(schema)} and c.relname = ${quoteLiteral(table)};`;
};

export async function tableDefinition(
  token: string,
  ref: string,
  schema: string,
  table: string,
): Promise<TableDefinition | null> {
  const rows = await readOnlyQuery<{ ddl: string | null; kind: string }>(
    token,
    ref,
    ddlSql(schema, table),
  );
  const row = rows[0];
  if (!row?.ddl) return null;
  if (row.ddl === UNSUPPORTED) return null;
  // Partitioned parents lose their partitioning clause here, so the output is labelled as partial
  // rather than offered as something that would recreate the table.
  return { ddl: row.ddl, complete: row.kind !== "p" };
}
