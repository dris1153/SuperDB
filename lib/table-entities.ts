/**
 * The Database › Tables list: every relation in one schema, as the original lists them.
 *
 * `schema-entities-sql.ts` reads them; this parses and filters, and has the tests. A schema arrives
 * whole, so search and the entity filter run in the browser.
 */

export type EntityKind = "r" | "v" | "m" | "f" | "p";

/** The original's five, in its order, with the words its empty state uses. */
export const ENTITY_TYPES: { kind: EntityKind; label: string; plural: string }[] = [
  { kind: "r", label: "Table", plural: "tables" },
  { kind: "v", label: "View", plural: "views" },
  { kind: "m", label: "Materialized view", plural: "materialized views" },
  { kind: "f", label: "Foreign table", plural: "foreign tables" },
  { kind: "p", label: "Partitioned table", plural: "partitioned tables" },
];

export const ALL_KINDS = ENTITY_TYPES.map((t) => t.kind);

export type Entity = {
  name: string;
  kind: EntityKind;
  comment: string | null;
  columns: number;
  /** Null for a view, which has neither. */
  rows: number | null;
  size: string | null;
  realtime: boolean;
};

const isKind = (v: unknown): v is EntityKind => ALL_KINDS.includes(v as EntityKind);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function readEntities(raw: unknown): Entity[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    if (typeof row.name !== "string" || !isKind(row.kind)) return [];
    return [
      {
        name: row.name,
        kind: row.kind,
        comment: typeof row.comment === "string" ? row.comment : null,
        columns: num(row.columns) ?? 0,
        rows: num(row.rows),
        size: typeof row.size === "string" ? row.size : null,
        realtime: row.realtime === true,
      },
    ];
  });
}

export const filterEntities = (list: Entity[], search: string, kinds: EntityKind[]) => {
  const needle = search.trim().toLowerCase();
  return list.filter((e) => kinds.includes(e.kind) && (!needle || e.name.toLowerCase().includes(needle)));
};

/** Only an ordinary or partitioned table can be edited, duplicated or dropped from here, as in the original. */
export const isWritableTable = (kind: EntityKind) => kind === "r" || kind === "p";

/** "No tables or views found in the schema "public"" — the original's sentence for an empty filter. */
export function noneFoundSentence(kinds: EntityKind[], schema: string): string {
  const words = ENTITY_TYPES.filter((t) => kinds.includes(t.kind)).map((t) => t.plural);
  const list = words.length <= 1 ? (words[0] ?? "entities") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
  return `No ${list} found in the schema "${schema}"`;
}

/** One column on the columns page: the original's Name, Type and Constraints. */
export type TableColumn = {
  name: string;
  type: string;
  comment: string | null;
  default: string | null;
  nullable: boolean;
  primary: boolean;
  foreign: boolean;
  unique: boolean;
  identity: boolean;
};

/** `found` false is the table not existing — a 404 on the page, not an empty list. */
export function readTableColumns(raw: unknown): { found: boolean; columns: TableColumn[] } {
  const doc = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(doc.columns) ? doc.columns : [];
  const text = (v: unknown) => (typeof v === "string" ? v : null);

  return {
    found: doc.found === true,
    columns: list.flatMap((c) => {
      const col = (c ?? {}) as Record<string, unknown>;
      if (typeof col.name !== "string") return [];
      return [
        {
          name: col.name,
          type: text(col.type) ?? "",
          comment: text(col.comment),
          default: text(col.default),
          nullable: col.nullable === true,
          primary: col.primary === true,
          foreign: col.foreign === true,
          unique: col.unique === true,
          identity: col.identity === true,
        },
      ];
    }),
  };
}
