"use client";

import {
  IconChevronDown,
  IconCopy,
  IconEyeOff,
  IconPencil,
  IconPinned,
  IconPinnedOff,
  IconRestore,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import type { ColumnInfo } from "@/lib/table-view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The per-column menu from Supabase's editor, minus everything that would write.
 *
 * Edit column is omitted rather than disabled on a view or a keyless table: a menu row that can never
 * be enabled is noise. `components/ui/dropdown-menu.tsx` has been vendored and unused since
 * the shadcn migration — this is its first consumer.
 */
export function ColumnMenu({
  column,
  frozen,
  canHide,
  tabIndex,
  onSort,
  onToggleFrozen,
  onHide,
  onReset,
  onEdit,
}: {
  column: ColumnInfo;
  frozen: boolean;
  /** False on the last visible column — hiding it would leave an empty grid. */
  canHide: boolean;
  /** react-data-grid's roving tabindex, so the grid is one tab stop rather than one per column. */
  tabIndex?: number;
  onSort: (dir: "asc" | "desc") => void;
  onToggleFrozen: () => void;
  onHide: () => void;
  onReset: () => void;
  /** Absent on a view or a keyless table, where the schema cannot be changed from here. */
  onEdit?: () => void;
}) {
  /**
   * react-data-grid puts its sort handler on the header cell itself and fires it on click and on
   * Space/Enter. This menu renders inside that cell, so without stopping propagation, opening the
   * menu — or picking any item in it — also re-sorts the table and triggers a navigation.
   *
   * The menu content is portalled, which does not help: React propagates synthetic events along the
   * React tree, and the portal is still a React descendant of the header cell.
   */
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Options for ${column.name}`}
          tabIndex={tabIndex}
          onClick={stop}
          onPointerDown={stop}
          onKeyDown={stop}
          className="rounded p-0.5 text-subtle opacity-0 group-hover/col:opacity-100 hover:bg-border hover:text-foreground data-[state=open]:opacity-100"
        >
          <IconChevronDown size={13} stroke={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" onClick={stop} onKeyDown={stop}>
        <DropdownMenuItem onSelect={() => onSort("asc")}>
          <IconSortAscending size={14} stroke={1.5} /> Sort ascending
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSort("desc")}>
          <IconSortDescending size={14} stroke={1.5} /> Sort descending
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggleFrozen}>
          {frozen ? <IconPinnedOff size={14} stroke={1.5} /> : <IconPinned size={14} stroke={1.5} />}
          {frozen ? "Unfreeze" : "Freeze"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onHide} disabled={!canHide}>
          <IconEyeOff size={14} stroke={1.5} /> Hide column
        </DropdownMenuItem>
        {onEdit ? (
          <>
            <DropdownMenuSeparator />
            {/* Drop lives inside the edit sheet, next to the row count that says what it costs. */}
            <DropdownMenuItem onSelect={onEdit}>
              <IconPencil size={14} stroke={1.5} /> Edit column
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(column.name).catch(() => {})}>
          <IconCopy size={14} stroke={1.5} /> Copy name
        </DropdownMenuItem>
        {/* A mis-drag on a fifty-column table is otherwise very tedious to undo by hand. */}
        <DropdownMenuItem onSelect={onReset}>
          <IconRestore size={14} stroke={1.5} /> Reset layout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
