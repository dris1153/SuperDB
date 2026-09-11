"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { reorderWithEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge";
import { IconChevronLeft, IconChevronRight, IconGripVertical } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useOptimisticOrder } from "./use-optimistic-order";

export type ProjectTile = { id: string; label: string; card: (controls: ReactNode) => ReactNode };

const KIND = "project-card";

/**
 * Drag-to-reorder for the board's grid. The same state machine as the connections table through
 * useOptimisticOrder; only the geometry differs.
 *
 * Edges are left and right, not top and bottom: a CSS grid lays cards out in DOM order, so a card's
 * neighbours in the list are its neighbours on screen regardless of how many columns the breakpoint
 * gives. The last card of one row and the first of the next are adjacent in both.
 *
 * The caller decides when this is allowed at all — see `disabled`. With a filter or a sort applied
 * the visible cards are a subset in some other order, and a drop has no position it could mean.
 */
export function SortableProjects({
  tiles: incoming,
  disabled,
  reorder,
}: {
  tiles: ProjectTile[];
  disabled: boolean;
  reorder: (refs: string[]) => Promise<void>;
}) {
  const { rows, commit, move, pending, error } = useOptimisticOrder(incoming, reorder);

  useEffect(() => {
    if (disabled) return;

    return monitorForElements({
      canMonitor: ({ source }) => source.data.kind === KIND,
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0];
        if (!target) return;

        const startIndex = rows.findIndex((row) => row.id === source.data.id);
        const indexOfTarget = rows.findIndex((row) => row.id === target.data.id);
        if (startIndex < 0 || indexOfTarget < 0) return;

        commit(
          reorderWithEdge({
            list: rows,
            startIndex,
            indexOfTarget,
            closestEdgeOfTarget: extractClosestEdge(target.data),
            axis: "horizontal",
          }),
        );
      },
    });
    // commit closes over rows, so this re-registers whenever the order changes. Registering mid-drag
    // is safe: PDND adds a new monitor to the active drag and still delivers onDrop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, disabled]);

  return (
    <>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((tile, index) => (
          <DraggableTile
            key={tile.id}
            tile={tile}
            index={index}
            count={rows.length}
            disabled={disabled}
            busy={pending}
            onMove={move}
          />
        ))}
      </div>
    </>
  );
}

function DraggableTile({
  tile,
  index,
  count,
  disabled,
  busy,
  onMove,
}: {
  tile: ProjectTile;
  index: number;
  count: number;
  disabled: boolean;
  busy: boolean;
  onMove: (id: string, delta: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = ref.current;
    const handle = grip.current;
    if (!element || !handle || disabled) return;

    return combine(
      draggable({
        element,
        // The grip only: dragging from the card would start on the link and stop text selecting.
        dragHandle: handle,
        getInitialData: () => ({ kind: KIND, id: tile.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.kind === KIND && source.data.id !== tile.id,
        getData: ({ input, element: target }) =>
          attachClosestEdge(
            { kind: KIND, id: tile.id },
            { input, element: target, allowedEdges: ["left", "right"] },
          ),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [tile.id, disabled]);

  const controls = disabled ? null : (
    <div className="mb-2 flex items-center gap-1">
      <span ref={grip} className="cursor-grab text-subtle" aria-hidden>
        <IconGripVertical size={15} stroke={1.5} />
      </span>
      <MoveButton
        label={`Move ${tile.label} earlier`}
        disabled={index === 0 || busy}
        onClick={() => onMove(tile.id, -1)}
      >
        <IconChevronLeft size={13} stroke={2} />
      </MoveButton>
      <MoveButton
        label={`Move ${tile.label} later`}
        disabled={index === count - 1 || busy}
        onClick={() => onMove(tile.id, 1)}
      >
        <IconChevronRight size={13} stroke={2} />
      </MoveButton>
    </div>
  );

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg",
        dragging && "opacity-40",
        edge === "left" && "border-l-2 border-l-primary",
        edge === "right" && "border-r-2 border-r-primary",
      )}
    >
      {tile.card(controls)}
    </div>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="text-subtle hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
