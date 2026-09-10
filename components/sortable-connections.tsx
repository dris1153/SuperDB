"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
import { IconChevronDown, IconChevronUp, IconGripVertical } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "./ui/table";

export type ConnectionRow = { id: string; label: string; cells: ReactNode };

const KIND = "connection-row";

/**
 * Drag-to-reorder over server-rendered cells: the page still renders every cell, and this only wraps
 * them in a row it can move. Keeps the connections page a server component.
 *
 * The up/down buttons are not redundant with the drag. Pragmatic Drag and Drop builds on HTML5 drag
 * events, which cannot be operated from the keyboard and do not fire on touch, so an accessible
 * reorder needs its own control — Atlassian's own guidance says the same.
 *
 * Dragging is disabled outright while a column sort is active: with rows displayed in some other
 * order there is no position a drop could mean. The header says so rather than letting a row snap
 * back with no explanation.
 */
export function SortableConnections({
  rows: incoming,
  sorted,
  reorder,
}: {
  rows: ConnectionRow[];
  sorted: boolean;
  reorder: (ids: string[]) => Promise<void>;
}) {
  const [rows, setRows] = useState(incoming);
  const [seen, setSeen] = useState(incoming);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // The page rebuilds this array on every render, so the identity always differs and this runs every
  // time. Taking the server's order while a write is still in flight would undo it on screen and
  // make the next click compute from a stale list, so it only applies once nothing is pending.
  if (incoming !== seen) {
    setSeen(incoming);
    if (!pending) {
      setRows(incoming);
      setError(null);
    }
  }

  function commit(next: ConnectionRow[]) {
    if (next.every((row, i) => row.id === rows[i]?.id)) return;

    setRows(next);
    setError(null);
    start(async () => {
      try {
        await reorder(next.map((row) => row.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the new order");
        // Ask the server rather than restoring a snapshot: after a failed write, anything held on
        // the client may itself be an optimistic order that was never stored.
        router.refresh();
      }
    });
  }

  function move(id: string, delta: number) {
    const from = rows.findIndex((row) => row.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) return;

    const next = [...rows];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  useEffect(() => {
    if (sorted) return;

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
            axis: "vertical",
          }),
        );
      },
    });
    // commit closes over rows, so this re-registers whenever the order changes. Registering mid-drag
    // is safe: PDND adds a new monitor to the active drag and still delivers onDrop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sorted]);

  return (
    <>
      {rows.map((row, index) => (
        <DraggableRow
          key={row.id}
          row={row}
          index={index}
          count={rows.length}
          disabled={sorted}
          busy={pending}
          onMove={move}
        />
      ))}

      {error ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="text-xs text-destructive" role="alert">
            {error}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function DraggableRow({
  row,
  index,
  count,
  disabled,
  busy,
  onMove,
}: {
  row: ConnectionRow;
  index: number;
  count: number;
  disabled: boolean;
  busy: boolean;
  onMove: (id: string, delta: number) => void;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
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
        // Without this the whole row is the handle: text stops being selectable and a drag starts
        // from the Edit and Disconnect buttons too.
        dragHandle: handle,
        getInitialData: () => ({ kind: KIND, id: row.id }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.kind === KIND && source.data.id !== row.id,
        getData: ({ input, element: target }) =>
          attachClosestEdge(
            { kind: KIND, id: row.id },
            { input, element: target, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [row.id, disabled]);

  return (
    <TableRow
      ref={ref}
      className={cn(
        dragging && "opacity-40",
        edge === "top" && "border-t-2 border-t-primary",
        edge === "bottom" && "border-b-2 border-b-primary",
      )}
    >
      <TableCell className="w-16 pr-0">
        {disabled ? null : (
          <div className="flex items-center gap-1">
            <span ref={grip} className="cursor-grab text-subtle" aria-hidden>
              <IconGripVertical size={15} stroke={1.5} />
            </span>
            <div className="flex flex-col">
              <MoveButton
                label={`Move ${row.label} up`}
                disabled={index === 0 || busy}
                onClick={() => onMove(row.id, -1)}
              >
                <IconChevronUp size={12} stroke={2} />
              </MoveButton>
              <MoveButton
                label={`Move ${row.label} down`}
                disabled={index === count - 1 || busy}
                onClick={() => onMove(row.id, 1)}
              >
                <IconChevronDown size={12} stroke={2} />
              </MoveButton>
            </div>
          </div>
        )}
      </TableCell>
      {row.cells}
    </TableRow>
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
