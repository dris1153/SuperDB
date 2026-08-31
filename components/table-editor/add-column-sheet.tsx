"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addColumn } from "@/lib/ddl-statements";
import { addColumn as addColumnAction, listColumnTypes } from "@/lib/ddl-actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ColumnForm, blankColumn } from "./column-form";
import { DdlConfirm } from "./ddl-confirm";

/**
 * Adding one column to an existing table.
 *
 * The primary-key switch is hidden here: `add column` cannot declare one, and a switch that is
 * silently dropped from the statement is worse than one that is absent. Changing a table's key is a
 * separate operation this phase does not do.
 */
export function AddColumnSheet({
  open,
  onOpenChange,
  projectRef,
  projectName,
  schema,
  table,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
}) {
  const router = useRouter();
  const [column, setColumn] = useState(blankColumn);
  /** Null until the catalog answers; empty means it answered with nothing. */
  const [types, setTypes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listColumnTypes(projectRef).then((t) => !cancelled && setTypes(t));
    return () => {
      cancelled = true;
    };
  }, [open, projectRef]);

  let sql: string | null = null;
  let problem: string | null = null;
  if (types == null) {
    problem = "Reading the project's type list…";
  } else if (types.length === 0) {
    problem = "Could not read the project's type list, so no column type can be checked.";
  } else {
    try {
      sql = addColumn(schema, table, column, types);
    } catch (e) {
      problem = e instanceof Error ? e.message : "This column cannot be built yet.";
    }
  }

  const close = () => {
    setColumn(blankColumn());
    setError(null);
    setConfirming(false);
    onOpenChange(false);
  };

  const confirm = () =>
    start(async () => {
      try {
        const res = await addColumnAction(projectRef, schema, table, column);
        if (!res.ok) {
          setError(res.reason);
          return;
        }
        close();
        router.refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the table.");
      }
    });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">
              Add a column to {schema}.{table}
            </SheetTitle>
            <SheetDescription>
              A NOT NULL column on a table that already has rows needs a default, or Postgres will
              refuse it.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-6">
            <ColumnForm
              column={column}
              types={types ?? []}
              onChange={setColumn}
              allowPrimaryKey={false}
            />
          </div>

          <SheetFooter>
            <Button
              size="sm"
              disabled={sql == null}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Add column
            </Button>
            {problem ? <p className="text-xs text-subtle">{problem}</p> : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action="Add column"
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        sql={sql}
        problem={problem}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
