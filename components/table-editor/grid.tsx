"use client";

import { useCallback, useMemo, useState } from "react";
import { DataGrid, type SortColumn } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import type { RowRecord } from "@/lib/table-rows";
import { fkTarget, serialiseSort, type ColumnInfo, type SortKey } from "@/lib/table-view";
import { cn } from "@/lib/utils";
import { CellEditDialog, useCellEdit } from "./cell-editor";
import { useGridColumns } from "./column-model";
import {
  ROW_HEIGHT,
  usable,
  useColumnPrefs,
  useDensity,
  type ColumnPrefs,
} from "./column-prefs";
import { useGridInteractions } from "./grid-interactions";
import { GridBanner } from "./grid-banner";
import { RowPanel } from "./row-panel";
import { useTableUrl } from "./url";

export function TableGrid({
  projectRef,
  schema,
  table,
  projectName,
  schemas,
  columns,
  rows,
  sort,
  editable,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  /** Schemas the sidebar lists. A foreign key pointing outside them cannot be followed. */
  schemas: string[];
  columns: ColumnInfo[];
  rows: RowRecord[];
  sort: SortKey[];
  /** False for a view, or a table with no primary key — nothing here can address a row. */
  editable: boolean;
}) {
  const { set, pending } = useTableUrl();
  const [expanded, setExpanded] = useState<RowRecord | null>(null);
  const [selected, setSelected] = useState((): ReadonlySet<string> => new Set());
  const { editing, clearEdit, onRowsChange } = useCellEdit(rows, columns);
  const [prefs, writePrefs] = useColumnPrefs(projectRef, schema, table);
  const { density } = useDensity();

  const pk = useMemo(() => columns.filter((c) => c.pk_pos != null), [columns]);
  /** No key, no way to name a row — so no selection, and no key getter for rdg to assert on. */
  const selectable = pk.length > 0;
  // A row is addressed by its key, so that is also what identifies it in a selection. JSON rather
  // than a joined string: concatenating a composite key would make ["1","23"] and ["12","3"] collide.
  const rowKey = useCallback((row: RowRecord) => JSON.stringify(pk.map((c) => row[c.name])), [pk]);
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected, rowKey],
  );

  const live = useMemo(() => new Set(columns.map((c) => c.name)), [columns]);
  const hidden = useMemo(() => new Set(usable(prefs.hidden, live)), [prefs.hidden, live]);
  const frozen = useMemo(() => new Set(usable(prefs.frozen, live)), [prefs.frozen, live]);

  // Stored names are filtered against the live column list before writing, so a dropped column
  // leaves no entry behind to be re-persisted forever.
  const save = useCallback(
    (next: ColumnPrefs) => {
      writePrefs({
        hidden: usable(next.hidden, live),
        frozen: usable(next.frozen, live),
        order: usable(next.order, live),
        widths: next.widths.filter(([name]) => live.has(name)),
      });
    },
    [writePrefs, live],
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
    editable,
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
      <GridBanner
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
        table={table}
        columns={columns}
        selectedRows={selectedRows}
        onClearSelection={() => setSelected(new Set())}
        hidden={hidden.size}
        frozen={frozen.size}
        onShowAll={() => save({ ...prefs, hidden: [] })}
        onUnpinAll={() => save({ ...prefs, frozen: [] })}
      />
      <div className="min-h-0 flex-1">
        <DataGrid
          className={cn("superdb-grid rdg-dark h-full transition-opacity", pending && "opacity-50")}
          columns={gridColumns}
          rows={rows}
          rowHeight={ROW_HEIGHT[density]}
          headerRowHeight={40}
          sortColumns={sortColumns}
          onSortColumnsChange={onSortColumnsChange}
          // All three together: rdg reads the latter two as "selectable" and then asserts on the key
          // getter, so dropping only the getter turns Shift+Space into a throw.
          rowKeyGetter={selectable ? rowKey : undefined}
          selectedRows={selectable ? selected : undefined}
          onSelectedRowsChange={selectable ? setSelected : undefined}
          onRowsChange={onRowsChange}
          onCellCopy={onCellCopy}
          onColumnsReorder={onColumnsReorder}
          columnWidths={columnWidths}
          onColumnWidthsChange={onColumnWidthsChange}
          aria-label="Table rows"
        />
      </div>
      <RowPanel
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
        table={table}
        columns={columns}
        row={expanded}
        editable={editable}
        onClose={() => setExpanded(null)}
      />
      <CellEditDialog
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
        table={table}
        columns={columns}
        pending={editing}
        onClose={clearEdit}
      />
    </div>
  );
}
