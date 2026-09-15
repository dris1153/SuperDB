"use client";

import { useEffect, useState, useTransition } from "react";
import { IconPlus } from "@tabler/icons-react";
import { createTable } from "@/lib/ddl-statements";
import type { NewColumn } from "@/lib/ddl-build";
import { createTable as createTableAction, listColumnTypes } from "@/lib/ddl-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ColumnForm, blankColumn } from "./column-form";
import { useRefreshTable } from "./use-refresh-table";
import { DdlConfirm } from "./ddl-confirm";

/** What Supabase's own New Table dialog starts you with, and what B2 needs to edit a row at all. */
const starter = (): NewColumn[] => [
  { name: "id", type: "int8", nullable: false, primaryKey: true, identity: true },
  {
    name: "created_at",
    type: "timestamptz",
    nullable: false,
    primaryKey: false,
    default: { kind: "expression", value: "now()" },
  },
];

export function NewTableSheet({
  open,
  onOpenChange,
  projectRef,
  projectName,
  schema,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRef: string;
  projectName: string;
  schema: string;
}) {
  const refresh = useRefreshTable(projectRef);
  const [name, setName] = useState("");
  const [rls, setRls] = useState(true);
  const [columns, setColumns] = useState(starter);
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

  // The same builder the server will run, against the same type list — so the preview is the
  // statement rather than a rendering of it. What cannot be built is reported here instead.
  //
  // The list is checked before building, so a sheet that has not heard back yet says so. Building
  // against an empty list makes the first starter column fail `checkType` and blame `int8` for a
  // read that simply has not landed.
  let sql: string | null = null;
  let problem: string | null = null;
  if (types == null) {
    problem = "Reading the project's type list…";
  } else if (types.length === 0) {
    problem = "Could not read the project's type list, so no column type can be checked.";
  } else {
    try {
      sql = createTable(schema, name, columns, types, { rls });
    } catch (e) {
      problem = e instanceof Error ? e.message : "This table cannot be built yet.";
    }
  }

  const close = () => {
    setName("");
    setRls(true);
    setColumns(starter());
    setError(null);
    setConfirming(false);
    onOpenChange(false);
  };

  const confirm = () =>
    start(async () => {
      try {
        const res = await createTableAction(projectRef, schema, name, columns, rls);
        if (!res.ok) {
          setError(res.reason);
          return;
        }
        close();
        refresh();
      } catch {
        // The action rejected rather than answering. The table may already exist; saying nothing
        // would send the user to create it again.
        setError("The request failed before it answered. Reload and check the table list.");
      }
    });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">New table in {schema}</SheetTitle>
            <SheetDescription>
              Row level security is on by default. With it off, every client key can read every row.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="table name"
              aria-label="Table name"
              className="h-8 font-mono text-xs"
            />

            <label className="flex items-center gap-2 text-xs">
              <Switch checked={rls} onCheckedChange={setRls} />
              Enable row level security
            </label>

            <div className="space-y-2">
              {columns.map((c, i) => (
                <ColumnForm
                  key={i}
                  column={c}
                  types={types ?? []}
                  onChange={(next) => setColumns(columns.map((c, j) => (j === i ? next : c)))}
                  onRemove={
                    columns.length > 1
                      ? () => setColumns(columns.filter((_, j) => j !== i))
                      : undefined
                  }
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setColumns([...columns, blankColumn()])}
              >
                <IconPlus size={13} stroke={1.5} /> Add column
              </Button>
            </div>
          </div>

          <SheetFooter>
            <Button size="sm" disabled={sql == null} onClick={() => { setError(null); setConfirming(true); }}>
              Create table
            </Button>
            {problem ? <p className="text-xs text-subtle">{problem}</p> : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action="Create table"
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={name}
        sql={sql}
        problem={problem}
        warning={
          rls ? null : (
            <p>
              Without row level security every row is readable by anyone holding the project&apos;s
              anon key.
            </p>
          )
        }
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
