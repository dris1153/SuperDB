"use client";

import { useEffect, useRef, useState } from "react";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { attachClosestEdge, extractClosestEdge, type Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { reorderWithEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge";
import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** One value in the sheet. `locked` is a value the type already has — Postgres cannot drop or move it. */
export type EnumItem = { id: string; value: string; locked: boolean };

const KIND = "enum-value";

/**
 * The values of a type, as the original lists them: a grip, the value, a delete. The grip also
 * answers ArrowUp and ArrowDown — HTML5 drag, which Pragmatic Drag and Drop builds on, cannot be
 * driven from the keyboard.
 */
export function EnumValues({ items, onChange, sortable }: { items: EnumItem[]; onChange: (next: EnumItem[]) => void; sortable: boolean }) {
  useEffect(() => {
    if (!sortable) return;
    return monitorForElements({
      canMonitor: ({ source }) => source.data.kind === KIND,
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const startIndex = items.findIndex((i) => i.id === source.data.id);
        const indexOfTarget = items.findIndex((i) => i.id === target.data.id);
        if (startIndex < 0 || indexOfTarget < 0) return;
        onChange(reorderWithEdge({ list: items, startIndex, indexOfTarget, closestEdgeOfTarget: extractClosestEdge(target.data), axis: "vertical" }));
      },
    });
  }, [items, onChange, sortable]);

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {items.map((item, index) => (
        <Row
          key={item.id}
          item={item}
          sortable={sortable}
          onMove={(delta) => move(index, delta)}
          onEdit={(value) => onChange(items.map((i) => (i.id === item.id ? { ...i, value } : i)))}
          onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
        />
      ))}
    </div>
  );
}

function Row({
  item,
  sortable,
  onMove,
  onEdit,
  onRemove,
}: {
  item: EnumItem;
  sortable: boolean;
  onMove: (delta: number) => void;
  onEdit: (value: string) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = ref.current;
    const handle = grip.current;
    if (!element || !handle || !sortable) return;
    return combine(
      draggable({ element, dragHandle: handle, getInitialData: () => ({ kind: KIND, id: item.id }) }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.kind === KIND && source.data.id !== item.id,
        getData: ({ input, element: target }) => attachClosestEdge({ kind: KIND, id: item.id }, { input, element: target, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [item.id, sortable]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2",
        edge === "top" && "shadow-[0_-2px_0_0_var(--primary)]",
        edge === "bottom" && "shadow-[0_2px_0_0_var(--primary)]",
      )}
    >
      {sortable ? (
        <button
          ref={grip}
          type="button"
          aria-label={`Move ${item.value || "value"} — arrow keys move it up or down`}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              onMove(e.key === "ArrowUp" ? -1 : 1);
            }
          }}
          className="cursor-grab rounded p-1 text-subtle hover:text-foreground"
        >
          <IconGripVertical size={14} />
        </button>
      ) : (
        <span className="w-[22px]" />
      )}
      <Input value={item.value} disabled={item.locked} onChange={(e) => onEdit(e.target.value)} className="h-9" aria-label="Value" />
      <button
        type="button"
        onClick={onRemove}
        disabled={item.locked}
        aria-label={`Remove ${item.value || "value"}`}
        className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconTrash size={14} />
      </button>
    </div>
  );
}
