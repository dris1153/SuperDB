"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { RenderEditCellProps, RowsChangeData } from "react-data-grid";
import type { RowRecord } from "@/lib/table-rows";
import type { ColumnInfo } from "@/lib/table-view";
import { countAffected, updateRow } from "@/lib/write-actions";
import { isBoolColumn, parseValue, toText } from "@/lib/cell-value";
import { ValueInput } from "./value-input";
import { useRefreshTable } from "./use-refresh-table";
import { WriteConfirm } from "./write-confirm";

/**
 * Editing one cell.
 *
 * The grid's editor only collects the text; nothing is written until the same confirmation every
 * other write goes through. That is why the dialog carries the input as well — the value shown there
 * is the value that will be sent, so there is no gap between what was confirmed and what happens.
 *
 * Nothing is mutated locally. The row list belongs to the server, and a grid that paints an edit it
 * has not yet been told succeeded will eventually paint one the database refused.
 */

/** A primary key cannot be changed here, and a generated column cannot be written at all. */
export const isEditableColumn = (c: ColumnInfo) => c.pk_pos == null && !c.generated;

/** What an editor starts with. Compact, unlike the detail sheet: a cell is one line high. */
export const toEditText = (value: unknown) =>
  value !== null && typeof value === "object" ? JSON.stringify(value) : toText(value);

/** A cell the user has finished typing into, waiting to be confirmed. */
export type PendingEdit = { row: RowRecord; column: ColumnInfo; initial: string };

/**
 * The in-grid control.
 *
 * rdg keeps the edited row itself and commits on Enter or on a click outside, so this holds no state
 * of its own — every keystroke goes back through `onRowChange`. Escape discards.
 */
export function CellEditor({
  column,
  info,
  row,
  onRowChange,
}: RenderEditCellProps<RowRecord> & { info: ColumnInfo }) {
  const text = toEditText(row[column.key]);
  const set = (next: string) => onRowChange({ ...row, [column.key]: next });
  const shared = {
    autoFocus: true,
    "aria-label": `Edit ${column.name}`,
    className: "size-full bg-card px-2 font-mono text-xs text-foreground outline-none",
  };

  // A free-text box would accept "TRUE", which Postgres coerces to true while the confirmation's
  // switch — bound to `value === "true"` — would show false. Three options cannot disagree.
  if (isBoolColumn(info)) {
    return (
      <select {...shared} value={text} onChange={(e) => set(e.target.value)}>
        <option value="true">true</option>
        <option value="false">false</option>
        {info.nullable ? <option value="">NULL</option> : null}
      </select>
    );
  }

  return <input {...shared} value={text} onChange={(e) => set(e.target.value)} />;
}

/**
 * The grid's half: what rdg commits, turned into a pending edit.
 *
 * rdg hands back a copy of the row list with the edit applied. It is read for the typed text and
 * then dropped — the write has not happened yet, and the server's copy is what the grid shows.
 */
export function useCellEdit(rows: RowRecord[], columns: ColumnInfo[]) {
  const [editing, setEditing] = useState<PendingEdit | null>(null);

  const onRowsChange = useCallback(
    (next: RowRecord[], { indexes, column }: RowsChangeData<RowRecord>) => {
      const row = rows[indexes[0]];
      const info = columns.find((c) => c.name === column.key);
      if (!row || !info) return;
      const initial = String(next[indexes[0]][column.key] ?? "");
      if (initial === toEditText(row[column.key])) return;
      setEditing({ row, column: info, initial });
    },
    [rows, columns],
  );

  return { editing, clearEdit: () => setEditing(null), onRowsChange };
}

export function CellEditDialog({
  projectRef,
  projectName,
  schema,
  table,
  columns,
  pending,
  onClose,
  onSaved,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  /** Null when nothing is being edited. */
  pending: PendingEdit | null;
  onClose: () => void;
  /** Ran after a write lands, for a caller holding a copy of the row that is now stale. */
  onSaved?: () => void;
}) {
  const refresh = useRefreshTable(projectRef);
  const [text, setText] = useState("");
  const [affected, setAffected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Seeding from the new cell is an adjustment to a prop change, so it happens during render —
  // in an effect it would show the previous cell's value for a frame. Same as `row-panel.tsx`.
  const [seen, setSeen] = useState(pending);
  if (pending !== seen) {
    setSeen(pending);
    setText(pending?.initial ?? "");
    setAffected(null);
    setError(null);
  }

  const key: Record<string, unknown> = {};
  if (pending) for (const c of columns) if (c.pk_pos != null) key[c.name] = pending.row[c.name];

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    countAffected(projectRef, schema, table, [key]).then((res) => {
      if (cancelled) return;
      if (res.ok) setAffected(res.n);
      else setError(res.reason);
    });
    return () => {
      cancelled = true;
    };
    // `key` is derived from `pending`, which is what actually changes.
  }, [pending, projectRef, schema, table]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = pending ? parseValue(pending.column, text) : null;
  const badValue = parsed && "error" in parsed ? parsed.error : null;

  const confirm = () =>
    start(async () => {
      if (!pending || affected == null || !parsed || "error" in parsed) return;
      const patch = { [pending.column.name]: parsed.value };
      const res = await updateRow(projectRef, schema, table, key, patch, affected);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      onClose();
      onSaved?.();
      await refresh();
    });

  return (
    <WriteConfirm
      open={pending !== null}
      onOpenChange={(open) => !open && onClose()}
      action={pending ? `Update ${pending.column.name}` : "Update"}
      projectName={projectName}
      projectRef={projectRef}
      schema={schema}
      table={table}
      affected={affected}
      busy={busy}
      blocked={badValue != null}
      error={error ?? badValue}
      onConfirm={confirm}
    >
      {pending ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-foreground">{pending.column.name}</span>
            <span className="font-mono text-subtle">{pending.column.short_type}</span>
            {pending.column.nullable ? <span className="text-subtle">empty writes NULL</span> : null}
          </div>
          <ValueInput column={pending.column} value={text} onChange={setText} disabled={busy} />
        </div>
      ) : null}
    </WriteConfirm>
  );
}
