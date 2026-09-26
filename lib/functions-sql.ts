import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import { readFunctions } from "./function-read";
import type { DbFunction, FunctionOptions } from "./function-statements";

/**
 * One schema's functions and procedures. `search_path` is emptied first, so a type in a signature
 * comes back qualified unless it is in `pg_catalog` — the text is replayed into `create or replace`
 * and `drop`, and must mean the same thing on the write role's path. Extension-owned functions are
 * left out: they are the extension's to change.
 */
export async function listFunctions(token: string, ref: string, schema: string): Promise<DbFunction[]> {
  const rows = await readOnlyQuery(
    token,
    ref,
    `set local search_path = '';
     select n.nspname::text as schema,
            p.proname::text as name,
            case p.prokind when 'p' then 'procedure' else 'function' end as kind,
            pg_catalog.pg_get_function_arguments(p.oid) as args,
            pg_catalog.pg_get_function_identity_arguments(p.oid) as identity,
            case when p.prokind = 'p' then null else pg_catalog.pg_get_function_result(p.oid) end as result,
            l.lanname::text as language,
            p.provolatile::text as behavior,
            p.prosecdef as "securityDefiner",
            coalesce(p.proconfig, '{}') as config,
            p.prosrc as definition
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     join pg_catalog.pg_language l on l.oid = p.prolang
     where n.nspname = ${quoteLiteral(schema)} and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_catalog.pg_depend d
                       where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                         and d.objid = p.oid and d.deptype = 'e')
     order by p.proname, identity;`,
  );
  return readFunctions(rows);
}

/**
 * What a function may be written with on this project: every type both by `typname` and by the name
 * `format_type` gives it (`int4` and `integer`), since a duplicated signature arrives in the second
 * form; and the languages installed, bar `internal` and `c`.
 */
export async function functionOptions(token: string, ref: string): Promise<FunctionOptions> {
  const [types, languages] = await Promise.all([
    readOnlyQuery<{ name: string }>(
      token,
      ref,
      `set local search_path = '';
       select distinct x.name from pg_catalog.pg_type t
       join pg_catalog.pg_namespace n on n.oid = t.typnamespace
       cross join lateral (values (t.typname::text), (pg_catalog.format_type(t.oid, null))) as x(name)
       where n.nspname in ('pg_catalog', 'public', 'extensions')
         and t.typtype in ('b', 'e', 'd') and t.typcategory <> 'P'
         and pg_catalog.left(t.typname::text, 1) <> '_'
       order by 1;`,
    ),
    readOnlyQuery<{ name: string }>(
      token,
      ref,
      `select lanname::text as name from pg_catalog.pg_language where lanname not in ('internal', 'c') order by 1;`,
    ),
  ]);
  return { types: types.map((t) => t.name), languages: languages.map((l) => l.name) };
}
