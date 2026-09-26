"use client";

import { createContext, memo, useContext } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  IconCopy,
  IconDiamond,
  IconDiamondFilled,
  IconDotsVertical,
  IconFingerprint,
  IconHash,
  IconKey,
  IconTable,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { tableMarkdown, type TableNodeData } from "@/lib/schema-graph";
import { NODE_WIDTH, ROW_HEIGHT } from "@/lib/schema-layout";
import { readPartOnce } from "@/components/use-project-part";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The project a node belongs to — the one thing its menu needs that the node's data does not carry. */
export const ProjectRefContext = createContext("");

// Handles must exist for edges to attach, and must not be seen: the original's trick.
const HIDDEN_HANDLE = "h-px! w-px! min-h-0! min-w-0! border-0! opacity-0!";

export async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}.`);
  } catch {
    toast.error("The clipboard refused. Copying needs a secure context.");
  }
}

function TableNodeView({ id, data }: NodeProps<Node<TableNodeData>>) {
  const projectRef = useContext(ProjectRefContext);

  if (data.foreign) {
    return (
      <div
        className="flex items-center rounded-sm border border-border bg-card px-2 font-mono text-[10px] text-muted-foreground"
        style={{ height: ROW_HEIGHT }}
      >
        {data.name}
        <Handle type="target" id={id} position={Position.Left} className={HIDDEN_HANDLE} />
      </div>
    );
  }

  const copySql = async () => {
    try {
      const def = await readPartOnce<{ ddl: string } | null>(projectRef, "definition", { schema: data.schema, table: data.name });
      if (!def) throw new Error("No definition came back for this table.");
      await copy(def.ddl, "the table as SQL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the definition.");
    }
  };

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-card text-[11px] shadow-xs" style={{ width: NODE_WIDTH }}>
      <div className="flex items-center justify-between gap-2 bg-muted/60 pr-1 pl-2" style={{ height: ROW_HEIGHT }}>
        <div className="flex min-w-0 items-center gap-1.5">
          <IconTable size={12} stroke={1.5} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground" title={data.comment ?? data.name}>
            {data.name}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            data-export-hidden
            aria-label={`${data.name} actions`}
            className="nodrag rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IconDotsVertical size={12} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/p/${projectRef}/tables?schema=${encodeURIComponent(data.schema)}&table=${encodeURIComponent(data.name)}`}>
                <IconTable size={14} /> View in Table Editor
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void copy(data.name, "the name")}>
              <IconCopy size={14} /> Copy name
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copySql()}>
              <IconCopy size={14} /> Copy as SQL
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void copy(tableMarkdown({ name: data.name, comment: data.comment, columns: data.columns }), "the table as Markdown")}
            >
              <IconCopy size={14} /> Copy as Markdown
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {data.columns.map((c) => (
        <div key={c.name} className="relative flex items-center border-t border-border px-2" style={{ height: ROW_HEIGHT }}>
          <span className="flex w-12 shrink-0 items-center gap-0.5 text-muted-foreground">
            {c.primary ? <IconKey size={10} stroke={1.5} /> : null}
            {c.nullable ? <IconDiamond size={10} stroke={1.5} /> : <IconDiamondFilled size={10} />}
            {c.unique ? <IconFingerprint size={10} stroke={1.5} /> : null}
            {c.identity ? <IconHash size={10} stroke={1.5} /> : null}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground" title={c.name}>
            {c.name}
          </span>
          <span className="shrink-0 pl-2 font-mono text-[9px] text-subtle">{c.format}</span>
          <Handle type="target" id={c.name} position={Position.Left} className={HIDDEN_HANDLE} />
          <Handle type="source" id={c.name} position={Position.Right} className={HIDDEN_HANDLE} />
        </div>
      ))}
    </div>
  );
}

// Only data changes what is drawn; xyflow hands new props on every drag and selection.
export const TableNode = memo(TableNodeView, (prev, next) => prev.id === next.id && prev.data === next.data);
