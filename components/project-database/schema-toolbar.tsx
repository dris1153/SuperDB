"use client";

import { useState } from "react";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";
import { IconChevronDown, IconCopy, IconDownload, IconSearch } from "@tabler/icons-react";
import { toast } from "sonner";
import { schemaMarkdown, tableNodeId, type SchemaGraph, type TableNodeData } from "@/lib/schema-graph";
import { autoLayout, positionsKey } from "@/lib/schema-layout";
import { readPartOnce } from "@/components/use-project-part";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadGraph } from "./schema-export";
import { copy } from "./table-node";

/** Schema, Find table, Copy as SQL and its menu, Auto layout — the original's bar, left to right. */
export function SchemaToolbar({
  projectRef,
  schema,
  schemas,
  graph,
  onSchema,
}: {
  projectRef: string;
  schema: string;
  schemas: string[];
  graph: SchemaGraph | null;
  onSchema: (schema: string) => void;
}) {
  const flow = useReactFlow<Node<TableNodeData>, Edge>();
  const [finding, setFinding] = useState(false);
  const [confirmLayout, setConfirmLayout] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!graph && graph.tables.length > 0;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const copySql = () =>
    run(async () => {
      const ddl = await readPartOnce<string>(projectRef, "schema-definition", { schema });
      if (!ddl) throw new Error("No tables came back to copy.");
      await copy(ddl, "the schema as SQL");
    });

  const download = (format: "png" | "svg") =>
    run(async () => {
      await downloadGraph(flow.getNodesBounds(flow.getNodes()), format, `superdb-schema-${projectRef}-${schema}`);
      toast.success(`Downloaded as ${format.toUpperCase()}.`);
    });

  const find = (name: string) => {
    setFinding(false);
    void flow.fitView({ nodes: [{ id: tableNodeId(name) }], duration: 300, maxZoom: 1.5 });
  };

  const relayout = () => {
    flow.setNodes((nodes) => autoLayout(nodes, flow.getEdges()));
    try {
      localStorage.removeItem(positionsKey(projectRef, schema));
    } catch {
      // Storage refused; the new layout still stands until the next reload.
    }
    setConfirmLayout(false);
    requestAnimationFrame(() => void flow.fitView({ duration: 300 }));
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <Select value={schema} onValueChange={onSchema}>
        <SelectTrigger size="sm" className="w-52" aria-label="Schema">
          <span className="text-muted-foreground">schema</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(schemas.includes(schema) ? schemas : [schema, ...schemas]).map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={finding} onOpenChange={setFinding}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={!ready} className="gap-1.5 text-muted-foreground">
            <IconSearch size={14} /> Find table...
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Find table..." />
            <CommandList>
              <CommandEmpty>No tables found.</CommandEmpty>
              {graph?.tables.map((t) => (
                <CommandItem key={t.name} value={t.name} onSelect={() => find(t.name)}>
                  {t.name}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex">
          <Button variant="outline" size="sm" disabled={!ready || busy} onClick={() => void copySql()} className="gap-1.5 rounded-r-none">
            <IconCopy size={14} /> Copy as SQL
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!ready || busy} aria-label="More export options" className="rounded-l-none border-l-0 px-1.5">
                <IconChevronDown size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => graph && void copy(schemaMarkdown(graph), "the schema as Markdown")}>
                <IconCopy size={14} /> Copy as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void download("png")}>
                <IconDownload size={14} /> Download as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void download("svg")}>
                <IconDownload size={14} /> Download as SVG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button variant="outline" size="sm" disabled={!ready} onClick={() => setConfirmLayout(true)}>
          Auto layout
        </Button>
      </div>

      <AlertDialog open={confirmLayout} onOpenChange={setConfirmLayout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Automatically arrange the layout of tables?</AlertDialogTitle>
            <AlertDialogDescription>
              Auto layout will rearrange all nodes in the graph. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={relayout}>Auto layout</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
