"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import type { RowRecord } from "@/lib/table-rows";
import type { ColumnInfo } from "@/lib/table-view";
import type { IncomingRef } from "@/lib/table-editor";
import { countAffected, deleteImpact, deleteRows } from "@/lib/write-actions";
import { Button } from "@/components/ui/button";
import { WriteConfirm } from "./write-confirm";

/**
 * Deleting the selected rows.
 *
 * The count and the cascade list are both fetched when the dialog opens, not held from earlier: the
 * confirmed number is sent back with the write and the server refuses if the table has moved on.
 */
export function DeleteRows({
  projectRef,
  projectName,
  schema,
  table,
  columns,
  selected,
  onDone,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
  selected: RowRecord[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [affected, setAffected] = useState<number | null>(null);
  const [impact, setImpact] = useState<IncomingRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const keys = selected.map((row) =>
    Object.fromEntries(columns.filter((c) => c.pk_pos != null).map((c) => [c.name, row[c.name]])),
  );

  // The reset belongs to the click that opens the dialog, not to the effect: doing it here would be
  // a synchronous setState inside an effect, and would also show the previous count for one frame.
  const openDialog = () => {
    setAffected(null);
    setError(null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    Promise.all([
      countAffected(projectRef, schema, table, keys),
      deleteImpact(projectRef, schema, table),
    ]).then(([count, refs]) => {
      if (cancelled) return;
      if (count.ok) setAffected(count.n);
      else setError(count.reason);
      setImpact(refs);
    });

    return () => {
      cancelled = true;
    };
    // `keys` is derived from `selected`, which is what actually changes.
  }, [open, projectRef, schema, table, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = () =>
    start(async () => {
      if (affected == null) return;
      const result = await deleteRows(projectRef, schema, table, keys, affected);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setOpen(false);
      onDone();
      router.refresh();
    });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs text-destructive"
        onClick={openDialog}
      >
        <IconTrash size={13} stroke={1.5} />
        Delete {selected.length}
      </Button>

      <WriteConfirm
        open={open}
        onOpenChange={setOpen}
        action={`Delete ${selected.length} row${selected.length === 1 ? "" : "s"}`}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        affected={affected}
        impact={impact}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
