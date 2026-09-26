import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import { readPolicies, type PoliciesPart } from "./policy-model";

/**
 * One schema's tables with their RLS flag, policies and Data API grants, and the role names the
 * editor offers — one statement. `search_path` is emptied so an expression comes back qualified
 * and means the same thing when it is replayed into `alter policy`.
 */
export async function listTablePolicies(token: string, ref: string, schema: string): Promise<PoliciesPart> {
  const rows = await readOnlyQuery<{ result: unknown }>(
    token,
    ref,
    `set local search_path = '';
     select json_build_object(
       'tables', coalesce((
         select json_agg(json_build_object(
           'name', c.relname::text,
           'rls', c.relrowsecurity,
           'policies', coalesce((
             select json_agg(json_build_object(
               'name', p.polname::text,
               'command', case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                                        when 'd' then 'DELETE' else 'ALL' end,
               'permissive', p.polpermissive,
               'roles', case when 0 = any (p.polroles) then json_build_array('public')
                             else (select json_agg(r.rolname::text order by r.rolname)
                                   from pg_catalog.pg_roles r where r.oid = any (p.polroles)) end,
               'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
               'check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
             ) order by p.polname)
             from pg_catalog.pg_policy p where p.polrelid = c.oid), '[]'),
           'grants', (
             select coalesce(json_object_agg(g.role, g.privileges), '{}')
             from (select r.rolname::text as role, json_agg(distinct a.privilege_type) as privileges
                   from pg_catalog.aclexplode(c.relacl) a
                   join pg_catalog.pg_roles r on r.oid = a.grantee
                   where r.rolname in ('anon', 'authenticated', 'service_role')
                     and a.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
                   group by r.rolname) g)
         ) order by c.relname)
         from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = ${quoteLiteral(schema)} and c.relkind in ('r', 'p') and not c.relispartition), '[]'),
       'roles', (select json_agg(rolname::text order by rolname) from pg_catalog.pg_roles
                 where pg_catalog.left(rolname::text, 3) <> 'pg_')
     ) as result;`,
  );
  return readPolicies(rows[0]?.result);
}
