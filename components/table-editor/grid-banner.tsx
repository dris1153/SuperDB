"use client";

import { IconEye } from "@tabler/icons-react";
import type { RowRecord } from "@/lib/table-rows";
import type { ColumnInfo } from "@/lib/table-view";
import { Button } from "@/components/ui/button";
import { DeleteRows } from "./delete-rows";

/**
 * The strip above the grid: what is selected, and what has been hidden or pinned.
 *
 * Delete lives here rather than in the toolbar because the selection it acts on belongs to the grid,
 * and lifting that state would mean another context for one array. It is also where the eye already
 * is once rows are ticked.
 *
 * Hide and Freeze both need an escape that is not "clear session storage": hiding a column removes
 * the header whose menu would unhide it, and pinning more columns than fit pushes their headers out
 * of reach entirely.
 */
export function GridBanner({
  projectRef,
  projectName,
  schema,
  table,
  columns,
  selectedRows,
  onClearSelection,
  hidden,
  frozen,
  onShowAll,
  onUnpinAll,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  selectedRows: RowRecord[];
  onClearSelection: () => void;
  hidden: number;
  frozen: number;
  onShowAll: () => void;
  onUnpinAll: () => void;
}) {
  return (
    <>
      {selectedRows.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
          {/* "on this page" is not padding: the selection cannot span pages, and saying so stops
              anyone assuming a filtered set is about to go. */}
          <span className="text-subtle">{selectedRows.length} selected on this page</span>
          <DeleteRows
            projectRef={projectRef}
            projectName={projectName}
            schema={schema}
            table={table}
            columns={columns}
            selected={selectedRows}
            onDone={onClearSelection}
          />
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
      ) : null}

      {hidden > 0 || frozen > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-subtle">
          <IconEye size={13} stroke={1.5} />
          {[hidden > 0 ? `${hidden} hidden` : null, frozen > 0 ? `${frozen} pinned` : null]
            .filter(Boolean)
            .join(" · ")}
          {hidden > 0 ? (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onShowAll}>
              Show all
            </Button>
          ) : null}
          {frozen > 0 ? (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onUnpinAll}>
              Unpin all
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
