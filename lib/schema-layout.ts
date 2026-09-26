import { Graph, layout } from "@dagrejs/dagre";
import type { TableNodeData } from "./schema-graph";

/** Rendered sizes the layout has to agree with — `components/project-database/table-node.tsx` draws to them. */
export const NODE_WIDTH = 200;
export const ROW_HEIGHT = 24;

export type Positions = Record<string, { x: number; y: number }>;

// Structural, so xyflow's own node objects pass as well as the ones `toGraph` builds.
type Placeable = { id: string; position: { x: number; y: number }; data: Pick<TableNodeData, "foreign" | "columns"> };
type Link = { source: string; target: string };

const heightOf = (n: Placeable) => (n.data.foreign ? ROW_HEIGHT : ROW_HEIGHT * (n.data.columns.length + 1));

/** dagre with the original's settings: left to right, a key pointing at what it references. */
export function autoLayout<N extends Placeable>(nodes: N[], edges: Link[]): N[] {
  const g = new Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", align: "UR", nodesep: 25, ranksep: 50 });

  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: heightOf(n) });
  for (const e of edges) g.setEdge(e.source, e.target);
  layout(g);

  // dagre anchors at the centre; React Flow at the top left.
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_WIDTH / 2, y: p.y - heightOf(n) / 2 } };
  });
}

/**
 * Saved places where there are any. A table with none — created since — goes in a small cascade above
 * the rest, as the original does, rather than re-running the layout over places somebody chose.
 */
export function place<N extends Placeable>(nodes: N[], edges: Link[], saved: Positions | null): N[] {
  if (!saved || !nodes.some((n) => saved[n.id])) return autoLayout(nodes, edges);

  const unsaved = nodes.filter((n) => !saved[n.id]).length;
  let fresh = 0;

  return nodes.map((n) => {
    if (saved[n.id]) return { ...n, position: saved[n.id] };
    const offset = fresh++ * 10;
    return { ...n, position: { x: offset, y: -(25 + ROW_HEIGHT + unsaved * 10) + offset } };
  });
}

/** What `localStorage` held, or null. It is the viewer's own data, but still checked before use. */
export function readPositions(raw: string | null): Positions | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const out: Positions = {};
    for (const [id, p] of Object.entries(parsed)) {
      const { x, y } = (p ?? {}) as { x?: unknown; y?: unknown };
      if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
        out[id] = { x, y };
      }
    }
    return out;
  } catch {
    return null;
  }
}

export const positionsKey = (ref: string, schema: string) => `superdb:schema-positions:${ref}:${schema}`;
