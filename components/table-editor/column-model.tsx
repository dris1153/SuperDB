"use client";

import { useMemo } from "react";
import type { Column } from "react-data-grid";
import { IconArrowsMaximize } from "@tabler/icons-react";
import type { RowRecord } from "@/lib/table-rows";
import { fkTarget, serialiseSort, type ColumnInfo } from "@/lib/table-view";
import { CellValue, FkJump, HeaderCell } from "./cells";
import { ColumnMenu } from "./column-menu";
import type { ColumnPrefs } from "./column-prefs";

/**
 * Turns catalog columns into react-data-grid columns.
 *
 * Split out of `grid.tsx` purely for size — the grid was past the repo's 200-line rule once the
 * column menu and the key navigation landed on it.
 */
export function useGridColumns({
  visible,
  prefs,
  frozen,
  schemas,
  set,
  save,
  jump,
  onExpand,
}: {
  visible: ColumnInfo[];
  prefs: ColumnPrefs;
  frozen: Set<string>;
  /** Schemas the sidebar lists. A foreign key pointing outside them cannot be followed. */
  schemas: string[];
  set: (patch: Record<string, string | string[] | null>) => void;
  save: (next: ColumnPrefs) => void;
  jump: (target: NonNullable<ReturnType<typeof fkTarget>>, row: RowRecord) => void;
  onExpand: (row: RowRecord) => void;
}) {
  return useMemo<Column<RowRecord>[]>(() => {
    // Stored order first, in its own sequence; anything it does not mention keeps catalog order
    // behind them. A column added to the table after the layout was saved therefore appears rather
    // than vanishing.
    const rank = new Map(prefs.order.map((name, i) => [name, i]));
    const ordered = [...visible].sort(
      (a, b) => (rank.get(a.name) ?? Infinity) - (rank.get(b.name) ?? Infinity),
    );

    const body = ordered.map((column): Column<RowRecord> => {
      const target = fkTarget(column);
      const reachable = target ? schemas.includes(target.schema) : false;

      return {
        key: column.name,
        name: column.name,
        resizable: true,
        sortable: true,
        draggable: true,
        minWidth: 110,
        width: 180,
        frozen: frozen.has(column.name),
        headerCellClass: "bg-card",
        renderHeaderCell: ({ tabIndex }) => (
          <HeaderCell
            column={column}
            menu={
              <ColumnMenu
                column={column}
                frozen={frozen.has(column.name)}
                canHide={visible.length > 1}
                tabIndex={tabIndex}
                onSort={(dir) =>
                  set({ sort: serialiseSort([{ column: column.name, dir }]), page: "1" })
                }
                onToggleFrozen={() =>
                  save({
                    ...prefs,
                    frozen: frozen.has(column.name)
                      ? prefs.frozen.filter((n) => n !== column.name)
                      : [...prefs.frozen, column.name],
                  })
                }
                onHide={() => save({ ...prefs, hidden: [...prefs.hidden, column.name] })}
                onReset={() => save({ hidden: [], frozen: [], order: [], widths: [] })}
              />
            }
          />
        ),
        renderCell: ({ row, tabIndex }) => (
          <div className="flex h-full items-center gap-1.5 overflow-hidden">
            <span className="truncate">
              <CellValue value={row[column.name]} type={column.short_type} />
            </span>
            {target ? (
              <FkJump
                column={column}
                row={row}
                reachable={reachable}
                tabIndex={tabIndex}
                onJump={jump}
              />
            ) : null}
          </div>
        ),
      };
    });

    return [
      {
        key: "__expand",
        name: "",
        width: 36,
        minWidth: 36,
        maxWidth: 36,
        frozen: true,
        resizable: false,
        sortable: false,
        cellClass: "p-0",
        renderHeaderCell: () => null,
        renderCell: ({ row, tabIndex }) => (
          <button
            onClick={() => onExpand(row)}
            tabIndex={tabIndex}
            aria-label="Expand row"
            className="flex size-full items-center justify-center text-subtle hover:text-foreground"
          >
            <IconArrowsMaximize size={13} stroke={1.5} />
          </button>
        ),
      },
      ...body,
    ];
  }, [visible, prefs, frozen, schemas, set, save, jump, onExpand]);
}
