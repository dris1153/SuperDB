"use client";

import "@xyflow/react/dist/style.css";
import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { IconDiamond, IconDiamondFilled, IconFingerprint, IconHash, IconKey } from "@tabler/icons-react";
import { toGraph, type SchemaGraph } from "@/lib/schema-graph";
import { place, positionsKey, readPositions } from "@/lib/schema-layout";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { SchemaToolbar } from "./schema-toolbar";
import { ProjectRefContext, TableNode } from "./table-node";

const NODE_TYPES = { table: TableNode };

// xyflow's theme, pointed at this app's palette.
const THEME = {
  "--xy-background-color": "transparent",
  "--xy-edge-stroke": "#525252",
  "--xy-edge-stroke-selected": "#3ecf8e",
  "--xy-minimap-background-color": "#171717",
  "--xy-minimap-mask-background-color": "rgb(18 18 18 / 0.7)",
  "--xy-minimap-node-background-color": "#393939",
} as CSSProperties;

// A graph object is new only when its contents changed — TanStack shares structure across refetches —
// so its identity is what remounts the canvas with fresh nodes.
const graphIds = new WeakMap<object, number>();
let nextGraphId = 0;
const idOf = (graph: object) => graphIds.get(graph) ?? (graphIds.set(graph, ++nextGraphId), nextGraphId);

/**
 * The Schema Visualizer, laid out as the original has it. The schema lives in the URL, written with
 * the history API as the Emails tab is, so a reload or a shared link opens the same one.
 */
export function SchemaVisualizer({ projectRef }: { projectRef: string }) {
  const params = useSearchParams();
  const schema = params.get("schema") || "public";

  const schemas = useProjectPart<{ schemas: string[] }>(projectRef, "schemas");
  const state = useProjectPart<SchemaGraph>(projectRef, "schema-graph", { schema });
  const graph = state.status === "ready" ? state.data : null;

  const setSchema = (next: string) => {
    const query = new URLSearchParams(params);
    query.set("schema", next);
    window.history.replaceState(null, "", `?${query.toString()}`);
  };

  return (
    <ProjectRefContext.Provider value={projectRef}>
      <ReactFlowProvider>
        <div className="flex h-full flex-col">
          <SchemaToolbar
            projectRef={projectRef}
            schema={schema}
            schemas={schemas.status === "ready" ? schemas.data.schemas : [schema]}
            graph={graph}
            onSchema={setSchema}
          />

          <div className="relative min-h-0 flex-1">
            {isWaiting(state) ? (
              <p className="p-8 text-sm text-subtle">Reading the schema…</p>
            ) : !graph ? (
              <div className="p-8">
                <Empty>{reasonOf(state)}</Empty>
              </div>
            ) : graph.tables.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <div className="text-sm text-foreground">No tables in schema</div>
                <p className="text-sm text-muted-foreground">The {schema} schema has no tables to draw.</p>
                <Button asChild size="sm" className="mt-2">
                  <Link href={`/p/${projectRef}/tables?schema=${encodeURIComponent(schema)}`}>Open Table Editor</Link>
                </Button>
              </div>
            ) : (
              <SchemaCanvas key={`${schema}:${idOf(graph)}`} projectRef={projectRef} schema={schema} graph={graph} />
            )}
          </div>

          <Legend />
        </div>
      </ReactFlowProvider>
    </ProjectRefContext.Provider>
  );
}

function SchemaCanvas({ projectRef, schema, graph }: { projectRef: string; schema: string; graph: SchemaGraph }) {
  const flow = useReactFlow();
  const key = positionsKey(projectRef, schema);

  const initial = useMemo(() => {
    const { nodes, edges } = toGraph(schema, graph);
    let saved = null;
    try {
      saved = readPositions(localStorage.getItem(key));
    } catch {
      // Private window or blocked storage: lay it out afresh.
    }
    return { nodes: place(nodes, edges, saved), edges: edges.map((e) => ({ ...e, type: "smoothstep" })) };
  }, [schema, graph, key]);

  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(flow.getNodes().map((n) => [n.id, n.position]))));
    } catch {
      // Not saved; the arrangement lasts until the page is left.
    }
  };

  return (
    <ReactFlow
      defaultNodes={initial.nodes}
      defaultEdges={initial.edges}
      nodeTypes={NODE_TYPES}
      onNodeDragStop={save}
      nodesConnectable={false}
      deleteKeyCode={null}
      minZoom={0.1}
      fitView
      colorMode="dark"
      style={THEME}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#2e2e2e" />
      <MiniMap pannable zoomable className="rounded-md border border-border" />
    </ReactFlow>
  );
}

function Legend() {
  const items = [
    { icon: <IconKey size={15} stroke={1.5} />, label: "Primary key" },
    { icon: <IconHash size={15} stroke={1.5} />, label: "Identity" },
    { icon: <IconFingerprint size={15} stroke={1.5} />, label: "Unique" },
    { icon: <IconDiamond size={15} stroke={1.5} />, label: "Nullable" },
    { icon: <IconDiamondFilled size={15} />, label: "Non-Nullable" },
  ];

  return (
    <ul className="flex shrink-0 flex-wrap items-center justify-center gap-4 border-t border-border bg-card px-2 py-2">
      {items.map(({ icon, label }) => (
        <li key={label} className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          {icon}
          {label}
        </li>
      ))}
    </ul>
  );
}
