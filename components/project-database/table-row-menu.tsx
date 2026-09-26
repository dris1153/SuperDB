"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconCopy, IconDotsVertical, IconEdit, IconEye, IconTrash } from "@tabler/icons-react";
import { dropTable } from "@/lib/ddl-statements";
import { dropTable as dropTableAction } from "@/lib/ddl-actions";
import { isWritableTable, type Entity } from "@/lib/table-entities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";
import { DuplicateTableDialog } from "./duplicate-table-dialog";
import { EditTableSheet } from "./edit-table-sheet";

/**
 * The original's four: View in Table Editor, Edit, Duplicate, Delete. The last three only on an
 * ordinary or partitioned table, as there. Delete is the Table Editor's own flow.
 */
export function TableRowMenu({
  projectRef,
  projectName,
  schema,
  entity,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  entity: Entity;
}) {
  const refresh = useRefreshTable(projectRef);
  const [open, setOpen] = useState<"edit" | "duplicate" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const writable = isWritableTable(entity.kind);

  const confirmDrop = () =>
    start(async () => {
      try {
        const res = await dropTableAction(projectRef, schema, entity.name);
        if (!res.ok) return setError(res.reason);
        setOpen(null);
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the table list.");
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="px-1.5" aria-label={`Table ${entity.name} actions`}>
            <IconDotsVertical size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/p/${projectRef}/tables?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(entity.name)}`}>
              <IconEye size={14} /> View in Table Editor
            </Link>
          </DropdownMenuItem>
          {writable ? (
            <>
              <DropdownMenuItem onSelect={() => setOpen("edit")}>
                <IconEdit size={14} /> Edit table
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpen("duplicate")}>
                <IconCopy size={14} /> Duplicate table
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setError(null);
                  setOpen("delete");
                }}
              >
                <IconTrash size={14} /> Delete table
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {writable ? (
        <>
          <EditTableSheet
            open={open === "edit"}
            onOpenChange={(next) => setOpen(next ? "edit" : null)}
            projectRef={projectRef}
            projectName={projectName}
            schema={schema}
            table={entity.name}
          />
          <DuplicateTableDialog
            open={open === "duplicate"}
            onOpenChange={(next) => setOpen(next ? "duplicate" : null)}
            projectRef={projectRef}
            projectName={projectName}
            schema={schema}
            table={entity.name}
          />
          <DdlConfirm
            open={open === "delete"}
            onOpenChange={(next) => setOpen(next ? "delete" : null)}
            action="Delete table"
            projectName={projectName}
            projectRef={projectRef}
            schema={schema}
            table={entity.name}
            sql={dropTable(schema, entity.name)}
            warning={
              <p>
                Every row, index and policy on this table goes with it. Anything referencing it by foreign key
                will refuse the drop rather than cascade.
              </p>
            }
            busy={busy}
            error={error}
            onConfirm={confirmDrop}
          />
        </>
      ) : null}
    </>
  );
}
