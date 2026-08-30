"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataGrid, type SortColumn } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { IconEye } from "@tabler/icons-react";
import type { RowRecord } from "@/lib/table-rows";
import { fkTarget, serialiseSort, type ColumnInfo, type SortKey } from "@/lib/table-view";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useGridColumns } from "./column-model";
import {
  EMPTY_PREFS,
  ROW_HEIGHT,
  readPrefs,
  usable,
  writePrefs,
  type ColumnPrefs,
} from "./column-prefs";
import { useDensity } from "./density";
import { useGridInteractions } from "./grid-interactions";
import { RowPanel } from "./row-panel";
import { useTableUrl } from "./url";

export function TableGrid({
  projectRef,
  schema,
  table,
  schemas,
  columns,
  rows,
  sort,
}: {
  projectRef: string;
  schema: string;
  table: string;
  /** Schemas the sidebar lists. A foreign key pointing outside them cannot be followed. */
  schemas: string[];
  columns: ColumnInfo[];
  rows: RowRecord[];
  sort: SortKey[];
}) {
  const { set, pending } = useTableUrl();
  const [expanded, setExpanded] = useState<RowRecord | null>(null);
  const [prefs, setPrefs] = useState<ColumnPrefs>(EMPTY_PREFS);
  const { density } = useDensity();

  // Storage is browser-only, so the first paint is server-rendered with every column visible.
  useEffect(() => {
    setPrefs(readPrefs(projectRef, schema, table));
  }, [projectRef, schema, table]);

  const live = useMemo(() => new Set(columns.map((c) => c.name)), [columns]);
  const hidden = useMemo(() => new Set(usable(prefs.hidden, live)), [prefs.hidden, live]);
  const frozen = useMemo(() => new Set(usable(prefs.frozen, live)), [prefs.frozen, live]);

  // Stored names are filtered against the live column list before writing, so a dropped column
  // leaves no entry behind to be re-persisted forever.
  const save = useCallback(
    (next: ColumnPrefs) => {
      const cleaned: ColumnPrefs = {
        hidden: usable(next.hidden, live),
        frozen: usable(next.frozen, live),
        order: usable(next.order, live),
        widths: next.widths.filter(([name]) => live.has(name)),
      };
      setPrefs(cleaned);
      writePrefs(projectRef, schema, table, cleaned);
    },
    [projectRef, schema, table, live],
  );

  // Every column of the key, not just the one clicked: filtering the referenced table on one column
  // of a two-column key returns a row set rather than the row.
  const jump = useCallback(
    (target: NonNullable<ReturnType<typeof fkTarget>>, row: RowRecord) =>
      set({
        schema: target.schema,
        table: target.table,
        filter: target.pairs.map((p) => `${p.remote}.eq.${String(row[p.local])}`),
        sort: null,
        page: "1",
      }),
    [set],
  );

  const visible = useMemo(() => columns.filter((c) => !hidden.has(c.name)), [columns, hidden]);

  const gridColumns = useGridColumns({
    visible,
    prefs,
    frozen,
    schemas,
    set,
    save,
    jump,
    onExpand: setExpanded,
  });

  const { onCellCopy, onColumnsReorder, columnWidths, onColumnWidthsChange } = useGridInteractions({
    prefs,
    save,
    columnKeys: useMemo(
      () => gridColumns.map((c) => c.key).filter((k) => k !== "__expand"),
      [gridColumns],
    ),
  });

  // Only the sort keys that are on screen: rdg numbers its priority badges from this list, so a
  // hidden sorted column would leave the visible ones labelled "2" and "3" with no "1" in sight.
  const sortColumns = useMemo<SortColumn[]>(
    () =>
      sort
        .filter((s) => !hidden.has(s.column))
        .map((s) => ({ columnKey: s.column, direction: s.dir === "desc" ? "DESC" : "ASC" })),
    [sort, hidden],
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
    // A column so the hidden-columns banner takes its own height instead of being overlapped by the
    // grid, which fills whatever is left.
    <div className="flex h-full flex-col">
      {/* Freeze has the same trap as Hide: pin more columns than fit and their headers scroll out of
          reach, taking the menu that would unfreeze them with it. Both need an escape that does not
          involve clearing session storage. */}
      {hidden.size > 0 || frozen.size > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-subtle">
          <IconEye size={13} stroke={1.5} />
          {[
            hidden.size > 0 ? `${hidden.size} hidden` : null,
            frozen.size > 0 ? `${frozen.size} pinned` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {hidden.size > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => save({ ...prefs, hidden: [] })}
            >
              Show all
            </Button>
          ) : null}
          {frozen.size > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => save({ ...prefs, frozen: [] })}
            >
              Unpin all
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <DataGrid
          className={cn("superdb-grid rdg-dark h-full transition-opacity", pending && "opacity-50")}
          columns={gridColumns}
          rows={rows}
          rowHeight={ROW_HEIGHT[density]}
          headerRowHeight={40}
          sortColumns={sortColumns}
          onSortColumnsChange={onSortColumnsChange}
          onCellCopy={onCellCopy}
          onColumnsReorder={onColumnsReorder}
          columnWidths={columnWidths}
          onColumnWidthsChange={onColumnWidthsChange}
          aria-label="Table rows"
        />
      </div>
      <RowPanel
        projectRef={projectRef}
        schema={schema}
        table={table}
        columns={columns}
        row={expanded}
        onClose={() => setExpanded(null)}
      />
    </div>
  );
}
