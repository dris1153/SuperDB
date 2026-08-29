"use client";

import { useEffect, useState } from "react";
import type { RowRecord } from "@/lib/table-rows";
import { getFullRow } from "@/lib/table-actions";
import type { ColumnInfo } from "@/lib/table-view";
import { CopyButton } from "@/components/copy-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** `jsonb` reads as a wall of text otherwise; everything else is already one line. */
function display(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function RowPanel({
  projectRef,
  schema,
  table,
  columns,
  row,
  onClose,
}: {
  projectRef: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  /** The grid's copy — wide values in it are already truncated. */
  row: RowRecord | null;
  onClose: () => void;
}) {
  const [full, setFull] = useState<RowRecord | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // The grid's values were cut off in SQL, so the panel goes back for the real ones. Until they
  // arrive the truncated copy is shown rather than a spinner — it is the same data, just shorter.
  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    setFull(null);
    setNote(null);
    const key: Record<string, string> = {};
    for (const c of columns) if (c.pk_pos != null) key[c.name] = String(row[c.name]);

    getFullRow(projectRef, schema, table, key).then((res) => {
      if (cancelled) return;
      if (res.row) setFull(res.row);
      else setNote(res.error ?? "Showing the truncated values from the grid.");
    });
    return () => {
      cancelled = true;
    };
  }, [projectRef, schema, table, columns, row]);

  const shown = full ?? row;

  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">
            {schema}.{table}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          {note ? <p className="text-xs text-warn">{note}</p> : null}
          {shown
            ? columns.map((c) => {
                const text = display(shown[c.name]);
                const empty = shown[c.name] === null || shown[c.name] === undefined;
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground">{c.name}</span>
                      <span className="font-mono text-[11px] text-subtle">{c.short_type}</span>
                      {c.pk_pos != null ? (
                        <span className="text-[10px] text-primary">PK</span>
                      ) : null}
                      <div className="ml-auto">
                        {empty ? null : <CopyButton value={text} />}
                      </div>
                    </div>
                    <pre
                      className={
                        empty
                          ? "text-xs italic text-subtle"
                          : "max-h-64 overflow-auto rounded border border-border bg-card p-2 font-mono text-xs whitespace-pre-wrap"
                      }
                    >
                      {text}
                    </pre>
                  </div>
                );
              })
            : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
