/**
 * A schema's tables and foreign keys, as the Schema Visualizer draws them.
 *
 * The catalog read in `schema-graph-sql.ts` answers one JSON document; this turns it into nodes and
 * edges in the shape `@xyflow/react` takes, without importing it, so it can be tested on its own.
 * Positions are left at zero — `schema-layout.ts` places them.
 */

export type GraphColumn = {
  name: string;
  format: string;
  nullable: boolean;
  identity: boolean;
  primary: boolean;
  unique: boolean;
};

export type GraphTable = { name: string; comment: string | null; columns: GraphColumn[] };

export type GraphRelationship = {
  id: string;
  source_table: string;
  source_column: string;
  target_schema: string;
  target_table: string;
  target_column: string;
};

export type SchemaGraph = { tables: GraphTable[]; relationships: GraphRelationship[] };

/** A table, or — `foreign` — the label a key into another schema points at. */
export type TableNodeData = { schema: string; name: string; comment: string | null; columns: GraphColumn[]; foreign: boolean };

export type GraphNode = { id: string; type: "table"; position: { x: number; y: number }; data: TableNodeData };

export type GraphEdge = { id: string; source: string; sourceHandle: string; target: string; targetHandle: string };

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** The part's answer, checked field by field: a malformed one is an empty graph, never a throw. */
export function readSchemaGraph(raw: unknown): SchemaGraph {
  const doc = obj(raw);

  const tables = list(doc.tables).map((t) => {
    const table = obj(t);
    return {
      name: str(table.name),
      comment: typeof table.comment === "string" ? table.comment : null,
      columns: list(table.columns).map((c) => {
        const col = obj(c);
        return {
          name: str(col.name),
          format: str(col.format),
          nullable: col.nullable === true,
          identity: col.identity === true,
          primary: col.primary === true,
          unique: col.unique === true,
        };
      }),
    };
  });

  const relationships = list(doc.relationships).map((r) => {
    const rel = obj(r);
    return {
      id: str(rel.id),
      source_table: str(rel.source_table),
      source_column: str(rel.source_column),
      target_schema: str(rel.target_schema),
      target_table: str(rel.target_table),
      target_column: str(rel.target_column),
    };
  });

  return { tables: tables.filter((t) => t.name), relationships: relationships.filter((r) => r.id) };
}

// Names, not oids: a table dropped and recreated keeps the place somebody dragged it to.
export const tableNodeId = (name: string) => `table:${name}`;
const labelNodeId = (schema: string, table: string, column: string) => `ref:${schema}.${table}.${column}`;

/**
 * Nodes and edges for one schema. A key into another schema points at a small label node —
 * `auth.users.id` — made once however many keys share it, as the original does.
 */
export function toGraph(schema: string, graph: SchemaGraph): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const node = (id: string, data: TableNodeData): GraphNode => ({ id, type: "table", position: { x: 0, y: 0 }, data });

  const nodes = graph.tables.map((t) =>
    node(tableNodeId(t.name), { schema, name: t.name, comment: t.comment, columns: t.columns, foreign: false }),
  );
  const columnsOf = new Map(graph.tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]));
  const labels = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const rel of graph.relationships) {
    if (!columnsOf.get(rel.source_table)?.has(rel.source_column)) continue;
    const source = { source: tableNodeId(rel.source_table), sourceHandle: rel.source_column };

    if (rel.target_schema !== schema) {
      const id = labelNodeId(rel.target_schema, rel.target_table, rel.target_column);
      if (!labels.has(id)) {
        labels.add(id);
        const name = `${rel.target_schema}.${rel.target_table}.${rel.target_column}`;
        nodes.push(node(id, { schema: rel.target_schema, name, comment: null, columns: [], foreign: true }));
      }
      edges.push({ id: rel.id, ...source, target: id, targetHandle: id });
      continue;
    }

    if (!columnsOf.get(rel.target_table)?.has(rel.target_column)) continue;
    edges.push({ id: rel.id, ...source, target: tableNodeId(rel.target_table), targetHandle: rel.target_column });
  }

  return { nodes, edges };
}

const escapeMarkdown = (s: string) => s.replace(/\\/g, "\\\\").replace(/([|`])/g, "\\$1").replace(/\n/g, " ");

/** The original's Markdown for one table: a heading, its comment, and a Name / Type / Constraints table. */
export function tableMarkdown(table: GraphTable): string {
  let md = `## Table \`${escapeMarkdown(table.name)}\`\n\n`;
  if (table.comment) md += `${table.comment}\n\n`;
  md += "### Columns\n\n| Name | Type | Constraints |\n|------|------|-------------|\n";

  for (const c of table.columns) {
    const constraints = [
      c.primary && "Primary",
      c.nullable && "Nullable",
      c.unique && "Unique",
      c.identity && "Identity",
    ].filter(Boolean);
    md += `| \`${escapeMarkdown(c.name)}\` | \`${escapeMarkdown(c.format)}\` | ${constraints.join(" ")} |\n`;
  }
  return md;
}

export const schemaMarkdown = (graph: SchemaGraph) => graph.tables.map(tableMarkdown).join("\n");
