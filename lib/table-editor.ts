import "server-only";
import { HIDDEN } from "./db-introspect";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import type { ColumnInfo } from "./table-view";

/**
 * Catalog reads behind the Table Editor.
 *
 * The query endpoint takes SQL as text with no bind parameters, so every name is interpolated —
 * through `quoteLiteral` when it is compared as text in a catalog lookup, through `quoteIdent` when
 * it names a real object. Callers must also check a name against the catalog before passing it here;
 * quoting keeps a hostile name inert, it does not make an unknown name meaningful.
 *
 * The role behind these queries is `supabase_read_only_user` with rolbypassrls, so results are NOT
 * filtered by row-level security. That is deliberate and matches Supabase's own editor, but it means
 * the grid never shows "what a user would see".
 */

export type TableKind = "r" | "p" | "v" | "m";

export type TableEntry = {
  name: string;
  kind: TableKind;
  rls: boolean;
  est_rows: number;
};

const schemaList = HIDDEN.map(quoteLiteral).join(", ");

export const listSchemas = async (token: string, ref: string): Promise<string[]> => {
  const rows = await readOnlyQuery<{ name: string }>(
    token,
    ref,
    `select n.nspname::text as name
     from pg_catalog.pg_namespace n
     where n.nspname not in (${schemaList}) and n.nspname not like 'pg\\_%'
     order by (n.nspname = 'public') desc, n.nspname;`,
  );
  return rows.map((r) => r.name);
};

/** Views and matviews are included: the editor can read them, it just cannot write anywhere. */
export const listTablesIn = (token: string, ref: string, schema: string) =>
  readOnlyQuery<TableEntry>(
    token,
    ref,
    // Partition children are relkind 'r' too. A table partitioned daily over three years would
    // otherwise contribute a thousand sidebar rows that are all the same table.
    `select c.relname::text as name,
            c.relkind::text as kind,
            c.relrowsecurity as rls,
            c.reltuples::bigint as est_rows
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = ${quoteLiteral(schema)} and c.relkind in ('r', 'p', 'v', 'm')
       and not c.relispartition
     order by c.relname;`,
  );

export const describeTable = (token: string, ref: string, schema: string, table: string) =>
  readOnlyQuery<ColumnInfo>(
    token,
    ref,
    `select a.attnum::int as ordinal,
            a.attname::text as name,
            ty.typname::text as short_type,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
            not a.attnotnull as nullable,
            pg_catalog.pg_get_expr(d.adbin, d.adrelid) as default_expr,
            pk.pos as pk_pos,
            (pk.pos is not null) as is_pk,
            fk.target as fk_target
     from pg_catalog.pg_attribute a
     join pg_catalog.pg_class c on c.oid = a.attrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_type ty on ty.oid = a.atttypid
     left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
     left join lateral (
       select array_position(k.conkey, a.attnum)::int as pos
       from pg_catalog.pg_constraint k
       where k.conrelid = c.oid and k.contype = 'p' and a.attnum = any(k.conkey) limit 1
     ) pk on true
     left join lateral (
       select (tn.nspname || '.' || tc.relname)::text as target
       from pg_catalog.pg_constraint k
       join pg_catalog.pg_class tc on tc.oid = k.confrelid
       join pg_catalog.pg_namespace tn on tn.oid = tc.relnamespace
       where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any(k.conkey) limit 1
     ) fk on true
     where n.nspname = ${quoteLiteral(schema)} and c.relname = ${quoteLiteral(table)}
       and a.attnum > 0 and not a.attisdropped
     order by a.attnum;`,
  );

export type Policy = {
  name: string;
  command: string;
  roles: string | null;
  using_expr: string | null;
  check_expr: string | null;
};

export const listPolicies = (token: string, ref: string, schema: string, table: string) =>
  readOnlyQuery<Policy>(
    token,
    ref,
    `select p.polname::text as name,
            case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                          when 'd' then 'DELETE' else 'ALL' end as command,
            -- polroles is {0} when a policy applies to PUBLIC, and oid 0 matches no pg_roles row.
            case when 0 = any(p.polroles) then 'public'
                 else (select string_agg(r.rolname::text, ', ' order by r.rolname)
                         from pg_catalog.pg_roles r where r.oid = any(p.polroles)) end as roles,
            pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expr,
            pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
     from pg_catalog.pg_policy p
     join pg_catalog.pg_class c on c.oid = p.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = ${quoteLiteral(schema)} and c.relname = ${quoteLiteral(table)}
     order by p.polname;`,
  );
