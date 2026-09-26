"use client";

import { useState, useTransition } from "react";
import { IconDotsVertical, IconTrash } from "@tabler/icons-react";
import { dropColumn } from "@/lib/ddl-statements";
import { columnUsage, dropColumn as dropColumnAction } from "@/lib/ddl-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DropWarning } from "@/components/table-editor/drop-warning";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";

/**
 * Edit and ⋮ › Delete column, as the original has them. Edit opens the column panel; delete is the
 * Table Editor's confirm, with how many rows hold a value read first.
 */
export function ColumnRowActions({
  projectRef,
  projectName,
  schema,
  table,
  column,
  columnCount,
  onEdit,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  column: string;
  columnCount: number;
  onEdit: () => void;
}) {
  const refresh = useRefreshTable(projectRef);
  const [dropping, setDropping] = useState(false);
  // Undefined while the count is being read; null when it could not be.
  const [usage, setUsage] = useState<{ total: number; filled: number } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  let sql: string | null = null;
  let problem: string | null = null;
  try {
    sql = dropColumn(schema, table, column, columnCount);
  } catch (e) {
    problem = e instanceof Error ? e.message : "This column cannot be dropped.";
  }

  const askDrop = () => {
    setError(null);
    setUsage(undefined);
    setDropping(true);
    columnUsage(projectRef, schema, table, column).then(setUsage, () => setUsage(null));
  };

  const confirm = () =>
    start(async () => {
      try {
        const res = await dropColumnAction(projectRef, schema, table, column);
        if (!res.ok) return setError(res.reason);
        setDropping(false);
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the columns.");
      }
    });

  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="px-1.5" aria-label={`${column} actions`}>
            <IconDotsVertical size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem variant="destructive" onSelect={askDrop}>
            <IconTrash size={14} /> Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DdlConfirm
        open={dropping}
        onOpenChange={setDropping}
        action={`Drop ${column}`}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        sql={sql}
        problem={problem}
        warning={usage === undefined ? <p>Reading how many rows hold a value…</p> : <DropWarning usage={usage} />}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </div>
  );
}
