"use client";

import { memo, useMemo } from "react";
import { DataGrid, type Column } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import type { RunResult, Row } from "@/lib/sql-editor-actions";
import { cn } from "@/lib/utils";

/**
 * What came back: rows, nothing, or why not.
 *
 * Columns are the keys of the first row. The endpoint returns no column metadata — measured, same as
 * everything else on this page — so there is nothing better to build them from, and a result with no
 * rows has no columns to show at all.
 */
// Memoised because the statement lives in the parent: without this, every keystroke in the editor
// re-renders the grid, which is real work on a wide result set and none of it can change.
export const Results = memo(function Results({
  result,
  pending,
}: {
  result: RunResult | null;
  pending: boolean;
}) {
  const rows = result?.status === "rows" ? result.rows : null;
  const columns = useMemo(() => columnsOf(rows), [rows]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 transition-opacity", pending && "opacity-50")}>
        {result?.status === "error" ? (
          <Panel>
            <div className="max-w-2xl space-y-1 text-left">
              <div className="font-mono text-xs text-destructive">
                {result.error.sqlstate ? `ERROR ${result.error.sqlstate}: ` : null}
                {result.error.text}
              </div>
              {result.error.line != null ? (
                <div className="text-xs text-subtle">
                  Line {result.error.line}
                  {result.error.column != null ? `, column ${result.error.column}` : null} — marked in
                  the editor.
                </div>
              ) : null}
            </div>
          </Panel>
        ) : rows == null ? (
          <Panel>Click Run to execute your query.</Panel>
        ) : rows.length === 0 ? (
          // A successful write looks exactly like this: the endpoint reports no affected-row count,
          // so "nothing came back" is all that can honestly be said.
          <Panel>Success. No rows returned.</Panel>
        ) : (
          <DataGrid
            className="superdb-grid rdg-dark h-full"
            columns={columns}
            rows={rows}
            rowHeight={32}
            headerRowHeight={36}
            aria-label="Query results"
          />
        )}
      </div>

      <p className="border-t border-border px-3 py-1.5 text-[11px] text-subtle">
        {rows != null ? (
          <span className="text-muted-foreground tabular-nums">
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </span>
        ) : null}{" "}
        Several statements at once run as one request, and only the last one&apos;s result comes back.
      </p>
    </div>
  );
});

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-subtle">
      {children}
    </div>
  );
}

function columnsOf(rows: Row[] | null): Column<Row>[] {
  if (!rows?.length) return [];
  return Object.keys(rows[0]).map((key) => ({
    key,
    name: key,
    resizable: true,
    renderCell: ({ row }) => cell(row[key]),
  }));
}

/** JSON and arrays arrive as objects; null has to be distinguishable from an empty string. */
function cell(value: unknown) {
  if (value === null || value === undefined) return <span className="text-subtle/60">NULL</span>;
  return <span className="font-mono">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>;
}
