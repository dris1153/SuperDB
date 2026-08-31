"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCopy, IconDots, IconFileCode, IconPlus, IconTrash } from "@tabler/icons-react";
import { dropTable } from "@/lib/ddl-statements";
import { dropTable as dropTableAction } from "@/lib/ddl-actions";
import { quoteQualified } from "@/lib/sql-ident";
import type { TableEntry } from "@/lib/table-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddColumnSheet } from "./add-column-sheet";
import { DdlConfirm } from "./ddl-confirm";

const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

/**
 * The per-table menu.
 *
 * Add column and Delete table appear only on an ordinary table. A view is dropped with `drop view`
 * and takes no columns, and this phase does not build either — so the rows are absent rather than
 * disabled, which is what the read-only version of this menu already decided about writes.
 */
export function TableMenu({
  schema,
  entry,
  projectRef,
  projectName,
  onViewDefinition,
}: {
  schema: string;
  entry: TableEntry;
  projectRef: string;
  projectName: string;
  onViewDefinition: () => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const qualified = quoteQualified(schema, entry.name);
  const isTable = entry.kind === "r" || entry.kind === "p";

  const confirmDrop = () =>
    start(async () => {
      try {
        const res = await dropTableAction(projectRef, schema, entry.name);
        if (!res.ok) {
          setError(res.reason);
          return;
        }
        setDropping(false);
        router.refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the table list.");
      }
    });

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Options for ${entry.name}`}
            // The row itself is a button; without this the menu click would also select the table.
            onClick={stop}
            onPointerDown={stop}
            onKeyDown={stop}
            className="rounded p-0.5 text-subtle opacity-0 group-hover/row:opacity-100 hover:bg-border hover:text-foreground data-[state=open]:opacity-100"
          >
            <IconDots size={13} stroke={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52" onClick={stop} onKeyDown={stop}>
          <DropdownMenuItem onSelect={() => copy(`${schema}.${entry.name}`)}>
            <IconCopy size={14} stroke={1.5} /> Copy name
          </DropdownMenuItem>
          {/* Quoted, so a mixed-case or reserved-word name pastes into psql and runs unchanged. */}
          <DropdownMenuItem onSelect={() => copy(`select * from ${qualified} limit 100;`)}>
            <IconCopy size={14} stroke={1.5} /> Copy select statement
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onViewDefinition}>
            <IconFileCode size={14} stroke={1.5} /> View definition
          </DropdownMenuItem>
          {isTable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAdding(true)}>
                <IconPlus size={14} stroke={1.5} /> Add column
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setError(null);
                  setDropping(true);
                }}
              >
                <IconTrash size={14} stroke={1.5} /> Delete table
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AddColumnSheet
        open={adding}
        onOpenChange={setAdding}
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
        table={entry.name}
      />

      <DdlConfirm
        open={dropping}
        onOpenChange={setDropping}
        action="Delete table"
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={entry.name}
        sql={dropTable(schema, entry.name)}
        warning={
          <p>
            Every row, index and policy on this table goes with it. Anything referencing it by
            foreign key will refuse the drop rather than cascade.
          </p>
        }
        busy={busy}
        error={error}
        onConfirm={confirmDrop}
      />
    </>
  );
}
