"use client";

import { useMemo, useState } from "react";
import { DataGrid, type Column, type SortColumn } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { IconArrowsMaximize } from "@tabler/icons-react";
import type { RowRecord } from "@/lib/table-rows";
import { serialiseSort, type ColumnInfo, type SortKey } from "@/lib/table-view";
import { cn } from "@/lib/utils";
import { CellValue, HeaderCell } from "./cells";
import { RowPanel } from "./row-panel";
import { useTableUrl } from "./url";

export function TableGrid({
  projectRef,
  schema,
  table,
  columns,
  rows,
  sort,
}: {
  projectRef: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  rows: RowRecord[];
  sort: SortKey[];
}) {
  const { set, pending } = useTableUrl();
  const [expanded, setExpanded] = useState<RowRecord | null>(null);

  const gridColumns = useMemo<Column<RowRecord>[]>(
    () => [
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
        renderCell: ({ row }) => (
          <button
            onClick={() => setExpanded(row)}
            aria-label="Expand row"
            className="flex size-full items-center justify-center text-subtle hover:text-foreground"
          >
            <IconArrowsMaximize size={13} stroke={1.5} />
          </button>
        ),
      },
      ...columns.map(
        (column): Column<RowRecord> => ({
          key: column.name,
          name: column.name,
          resizable: true,
          sortable: true,
          minWidth: 110,
          width: 180,
          headerCellClass: "bg-card",
          renderHeaderCell: () => <HeaderCell column={column} />,
          renderCell: ({ row }) => <CellValue value={row[column.name]} type={column.short_type} />,
        }),
      ),
    ],
    [columns],
  );

  const sortColumns = useMemo<SortColumn[]>(
    () => sort.map((s) => ({ columnKey: s.column, direction: s.dir === "desc" ? "DESC" : "ASC" })),
    [sort],
  );

  // Sorting re-queries on the server: ordering only the rows already on screen would be a lie about
  // the other million.
  const onSortColumnsChange = (next: SortColumn[]) => {
    if (pending) return;
    const keys = next.map(
      (s) => ({ column: s.columnKey, dir: s.direction === "DESC" ? "desc" : "asc" }) as SortKey,
    );
    set({ sort: keys.length > 0 ? serialiseSort(keys) : null, page: "1" });
  };

  return (
    <>
      <DataGrid
        className={cn("superdb-grid rdg-dark h-full transition-opacity", pending && "opacity-50")}
        columns={gridColumns}
        rows={rows}
        rowHeight={36}
        headerRowHeight={40}
        sortColumns={sortColumns}
        onSortColumnsChange={onSortColumnsChange}
        aria-label="Table rows"
      />
      <RowPanel
        projectRef={projectRef}
        schema={schema}
        table={table}
        columns={columns}
        row={expanded}
        onClose={() => setExpanded(null)}
      />
    </>
  );
}
