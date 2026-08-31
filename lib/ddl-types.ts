import "server-only";
import { readOnlyQuery } from "./mgmt-api";

/**
 * The type names a column may be given, read from the database itself.
 *
 * An allowlist rather than a format check, because there is no safe way to *quote* a type name: a
 * type is grammar, and an unknown one in quotes is still an unknown one. Read per request rather
 * than hard-coded, so a project's own enums and domains are offered alongside the built-in types.
 *
 * `typtype` keeps base types, enums and domains; arrays are excluded because a column declares one
 * with `[]` rather than by naming `_int4`, and pseudo-types (`typcategory = 'P'`) cannot be columns
 * at all. No LIKE pattern here on purpose — an escape sequence in SQL written inside a TypeScript
 * template literal has to survive two levels of unescaping to mean what it reads as, and the plan's
 * `not like '\_%'` arrived as `_%` and matched every name.
 *
 * The three schemas are the ones a bare type name can resolve to on the write endpoint. Measured
 * there: `current_setting('search_path')` is `"$user", public, extensions`, and `pg_catalog` is
 * always searched first whether or not it is named. `extensions` is where Supabase installs `citext`
 * and `vector`; leaving it out offered a shorter list than the database would actually accept.
 *
 * Names come back bare and are deduplicated with `pg_catalog` winning, which is the same order the
 * resolver uses — so the name shown is the type that will be created.
 */
export async function listTypes(token: string, ref: string): Promise<string[]> {
  const rows = await readOnlyQuery<{ name: string; schema: string }>(
    token,
    ref,
    `select t.typname::text as name, n.nspname::text as schema
       from pg_catalog.pg_type t
       join pg_catalog.pg_namespace n on n.oid = t.typnamespace
      where n.nspname in ('pg_catalog', 'public', 'extensions')
        and t.typtype in ('b', 'e', 'd')
        and t.typcategory <> 'P'
        and pg_catalog.left(t.typname::text, 1) <> '_'
      order by case n.nspname when 'pg_catalog' then 0 when 'public' then 1 else 2 end, t.typname;`,
  );
  return [...new Set(rows.map((r) => r.name))].sort();
}
