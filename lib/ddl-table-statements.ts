// Explicit .ts extensions: reached from a node:test file, as `ddl-statements.ts` is.
import { quoteIdent, quoteLiteral, quoteQualified } from "./sql-ident.ts";
import { checkName } from "./ddl-build.ts";
import { setRls } from "./ddl-statements.ts";

/** The table-level fields the original's Edit table panel carries. */
export type TableState = { name: string; comment: string; rls: boolean; realtime: boolean };

/**
 * Only what changed, in one string. **The rename goes last**, so every statement before it can name
 * the table as it still is — a rename first would leave the rest pointing at a table that is gone.
 */
export function editTable(schema: string, before: TableState, after: TableState): string {
  const q = quoteQualified(schema, before.name);
  const out: string[] = [];

  const comment = after.comment.trim();
  if (comment !== before.comment.trim()) {
    out.push(`comment on table ${q} is ${comment ? quoteLiteral(comment) : "null"};`);
  }
  if (after.rls !== before.rls) out.push(setRls(schema, before.name, after.rls));
  if (after.realtime !== before.realtime) {
    out.push(`alter publication supabase_realtime ${after.realtime ? "add" : "drop"} table ${q};`);
  }
  if (after.name !== before.name) {
    checkName(after.name, "table name");
    out.push(`alter table ${q} rename to ${quoteIdent(after.name)};`);
  }

  if (out.length === 0) throw new Error("Nothing has changed");
  return out.join("\n");
}

/** What a duplicate needs to know about its source, read from the catalog on both sides. */
export type DuplicateFacts = {
  /** `pg_get_constraintdef` of each foreign key — `including all` does not copy them. */
  foreignKeys: string[];
  /** Every column a row copy may write: generated columns are computed, never inserted. */
  insertColumns: string[];
  identityColumns: string[];
  rls: boolean;
  comment: string | null;
};

/**
 * The original's recipe: `like … including all`, then the foreign keys it leaves behind, the
 * comment, and RLS as the source has it. Policies are not copied — nor by the original.
 *
 * With data, `overriding system value` keeps identity values as they were, and each identity
 * sequence is then moved past the copied maximum so the next insert does not collide.
 */
export function duplicateTable(
  schema: string,
  source: string,
  target: string,
  facts: DuplicateFacts,
  withData: boolean,
): string {
  checkName(target, "table name");
  if (target === source) throw new Error("The copy needs a different name");

  const src = quoteQualified(schema, source);
  const dst = quoteQualified(schema, target);
  const out = [`create table ${dst} (like ${src} including all);`];

  for (const fk of facts.foreignKeys) out.push(`alter table ${dst} add ${fk};`);
  if (facts.comment) out.push(`comment on table ${dst} is ${quoteLiteral(facts.comment)};`);
  if (facts.rls) out.push(`alter table ${dst} enable row level security;`);

  if (withData && facts.insertColumns.length > 0) {
    const cols = facts.insertColumns.map(quoteIdent).join(", ");
    out.push(`insert into ${dst} (${cols}) overriding system value select ${cols} from ${src};`);

    for (const column of facts.identityColumns) {
      const c = quoteIdent(column);
      out.push(
        `select pg_catalog.setval(pg_catalog.pg_get_serial_sequence(${quoteLiteral(dst)}, ${quoteLiteral(column)}), m) ` +
          `from (select max(${c}) as m from ${dst}) s where m is not null;`,
      );
    }
  }

  return out.join("\n");
}

/** Everything both dialogs need about one table, as the part and the server read it. */
export type TableFacts = DuplicateFacts & { realtime: boolean };

export function readTableFacts(raw: unknown): TableFacts | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;
  const names = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    foreignKeys: names(f.foreignKeys),
    insertColumns: names(f.insertColumns),
    identityColumns: names(f.identityColumns),
    rls: f.rls === true,
    realtime: f.realtime === true,
    comment: typeof f.comment === "string" ? f.comment : null,
  };
}
