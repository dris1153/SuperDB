"use client";

import type { RowRecord } from "@/lib/table-rows";
import type { ColumnInfo } from "@/lib/table-view";
import { CellEditDialog, type PendingEdit } from "./cell-editor";
import { ColumnPanel } from "./column-panel";
import { RowPanel } from "./row-panel";

/**
 * The three things that open over the grid: one row in full, one column's schema, one cell's value.
 *
 * Grouped because they all address the same table with the same four identifiers, and listing them
 * separately put `grid.tsx` past the repo's 200-line rule.
 */
export function GridOverlays({
  projectRef,
  projectName,
  schema,
  table,
  columns,
  editable,
  expandedRow,
  onCloseRow,
  editingColumn,
  onCloseColumn,
  pendingCell,
  onCloseCell,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  editable: boolean;
  expandedRow: RowRecord | null;
  onCloseRow: () => void;
  editingColumn: ColumnInfo | null;
  onCloseColumn: () => void;
  pendingCell: PendingEdit | null;
  onCloseCell: () => void;
}) {
  return (
    <>
      <RowPanel
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
        table={table}
        columns={columns}
        row={expandedRow}
        editable={editable}
        onClose={onCloseRow}
      />
      <ColumnPanel
        open={editingColumn !== null}
        column={editingColumn?.name ?? null}
        onClose={onCloseColumn}
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
        table={table}
      />
      <CellEditDialog
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
        table={table}
        columns={columns}
        pending={pendingCell}
        onClose={onCloseCell}
      />
    </>
  );
}
