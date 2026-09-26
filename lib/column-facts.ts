// Explicit .ts extensions: reached from a node:test file.
import { FK_ACTIONS, type ColumnContext, type ColumnSpec, type FkAction, type ForeignKey } from "./column-statements.ts";

/**
 * What the `column-facts` part answers, and the one check that stands between a browser's form and
 * a statement: `readColumnSpec`, which the server runs on whatever the panel posted.
 */
export type ColumnFacts = ColumnContext & {
  found: boolean;
  /** How many columns the table has — Postgres refuses to drop the last one. */
  columnCount: number;
  /** Null for a new column. */
  column: ColumnSpec | null;
  /** Multi-column unique, check or foreign keys naming this column — not this panel's to edit. */
  sharedConstraints: number;
};

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const isAction = (v: unknown): v is FkAction => FK_ACTIONS.some((a) => a.code === v);

function readKey(v: unknown): ForeignKey | null {
  const k = obj(v);
  if (!str(k.schema) || !str(k.table) || !str(k.column) || !isAction(k.onUpdate) || !isAction(k.onDelete)) return null;
  return {
    name: typeof k.name === "string" && k.name ? k.name : null,
    schema: str(k.schema),
    table: str(k.table),
    column: str(k.column),
    onUpdate: k.onUpdate,
    onDelete: k.onDelete,
  };
}

/** Field by field; anything that is not the shape is refused rather than coerced into it. */
export function readColumnSpec(v: unknown): ColumnSpec | null {
  const s = obj(v);
  const texts = ["name", "comment", "type", "default", "check"] as const;
  const flags = ["array", "identity", "nullable", "primary", "unique"] as const;
  if (texts.some((f) => typeof s[f] !== "string" || (s[f] as string).length > 2000)) return null;
  if (flags.some((f) => typeof s[f] !== "boolean")) return null;
  if (!Array.isArray(s.foreignKeys) || s.foreignKeys.length > 20) return null;
  const keys = s.foreignKeys.map(readKey);
  if (keys.some((k) => k === null)) return null;

  return {
    name: s.name as string,
    comment: s.comment as string,
    type: s.type as string,
    array: s.array as boolean,
    identity: s.identity as boolean,
    default: s.default as string,
    nullable: s.nullable as boolean,
    primary: s.primary as boolean,
    unique: s.unique as boolean,
    check: s.check as string,
    foreignKeys: keys as ForeignKey[],
  };
}

/** The catalog's answer as the panel's `before`. A stored default shows in brackets — it is an expression. */
export function readColumnFacts(raw: unknown): ColumnFacts {
  const f = obj(raw);
  const pkColumns = Array.isArray(f.pkColumns) ? f.pkColumns.filter((c): c is string => typeof c === "string") : [];
  const c = typeof f.column === "object" && f.column !== null ? obj(f.column) : null;
  const check = c ? obj(c.check) : {};

  return {
    found: f.found === true,
    columnCount: typeof f.columnCount === "number" ? f.columnCount : 0,
    pkName: str(f.pkName) || null,
    pkColumns,
    uniqueName: c ? str(c.uniqueName) || null : null,
    checkName: str(check.name) || null,
    sharedConstraints: c && typeof c.sharedConstraints === "number" ? c.sharedConstraints : 0,
    column: c
      ? {
          name: str(c.name),
          comment: str(c.comment),
          type: str(c.type),
          array: c.array === true,
          identity: c.identity === true,
          default: str(c.default) ? `(${str(c.default)})` : "",
          nullable: c.nullable === true,
          primary: pkColumns.includes(str(c.name)),
          unique: !!str(c.uniqueName),
          // `pg_get_expr` wraps a check in one pair of brackets; the builder adds its own.
          check: str(check.expr).replace(/^\((.*)\)$/s, "$1"),
          foreignKeys: (Array.isArray(c.foreignKeys) ? c.foreignKeys : []).map(readKey).filter((k): k is ForeignKey => k !== null),
        }
      : null,
  };
}
