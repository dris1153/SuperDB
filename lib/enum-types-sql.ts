import "server-only";
import { readOnlyQuery } from "./mgmt-api";
import { quoteLiteral } from "./sql-ident";
import { readEnums, type EnumType } from "./enum-statements";

/** One schema's enumerated types, labels in their declared order. */
export async function listEnums(token: string, ref: string, schema: string): Promise<EnumType[]> {
  const rows = await readOnlyQuery(
    token,
    ref,
    `select t.typname::text as name,
            pg_catalog.obj_description(t.oid, 'pg_type') as comment,
            coalesce((select json_agg(e.enumlabel::text order by e.enumsortorder)
                      from pg_catalog.pg_enum e where e.enumtypid = t.oid), '[]') as values
     from pg_catalog.pg_type t
     join pg_catalog.pg_namespace n on n.oid = t.typnamespace
     where n.nspname = ${quoteLiteral(schema)} and t.typtype = 'e'
     order by t.typname;`,
  );
  return readEnums(rows);
}
