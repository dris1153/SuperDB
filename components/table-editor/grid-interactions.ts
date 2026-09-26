"use client";

import { useCallback, useMemo } from "react";
import type { RowRecord } from "@/lib/table-rows";
import type { ColumnPrefs } from "./column-prefs";

/**
 * Copy, reorder and resize — the parts of the grid that only move things around.
 *
 * Separate from `grid.tsx` for size, and because none of it touches the data: these three handlers
 * read and write column preferences and nothing else.
 */

type RdgColumnWidth = { type: "resized" | "measured"; width: number };

export function useGridInteractions({
  prefs,
  save,
  columnKeys,
}: {
  prefs: ColumnPrefs;
  save: (next: ColumnPrefs) => void;
  /** Current display order, expand column excluded. */
  columnKeys: string[];
}) {
  /**
   * react-data-grid copies nothing on its own — without this handler Ctrl+C on a cell does nothing.
   *
   * The value written is the one on screen, ellipsis and all, because the grid truncates wide values
   * in SQL. Pasting a silently shortened value is worse than pasting a visibly shortened one; the row
   * detail sheet is where the full value lives.
   */
  const onCellCopy = useCallback(
    ({ column, row }: { column: { key: string }; row: RowRecord }, event: React.ClipboardEvent) => {
      const value = row[column.key];
      const text =
        value === null || value === undefined
          ? ""
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      try {
        event.clipboardData.setData("text/plain", text);
        event.preventDefault();
      } catch {
        // Clipboard access is denied outside a secure context; nothing useful to do about it.
      }
    },
    [],
  );

  const onColumnsReorder = useCallback(
    (sourceKey: string, targetKey: string) => {
      const next = [...columnKeys];
      const from = next.indexOf(sourceKey);
      const to = next.indexOf(targetKey);
      if (from < 0 || to < 0) return;
      next.splice(to, 0, ...next.splice(from, 1));
      save({ ...prefs, order: next });
    },
    [columnKeys, prefs, save],
  );

  const columnWidths = useMemo(
    () =>
      new Map<string, RdgColumnWidth>(
        prefs.widths.map(([k, w]) => [k, { type: "resized", width: w }]),
      ),
    [prefs.widths],
  );

  // Only widths the user dragged are kept. rdg also reports the ones it measured itself, and storing
  // those would pin every column to whatever the first render happened to fit.
  const onColumnWidthsChange = useCallback(
    (next: ReadonlyMap<string, RdgColumnWidth>) => {
      const resized: [string, number][] = [...next]
        .filter(([, v]) => v.type === "resized")
        .map(([k, v]) => [k, v.width]);
      save({ ...prefs, widths: resized });
    },
    [prefs, save],
  );

  return { onCellCopy, onColumnsReorder, columnWidths, onColumnWidthsChange };
}
