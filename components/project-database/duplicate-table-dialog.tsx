"use client";

import { useState, useTransition } from "react";
import { duplicateTable, type TableFacts } from "@/lib/ddl-table-statements";
import { duplicateTable as duplicateTableAction } from "@/lib/table-ddl-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";

/**
 * Duplicate table, the original's recipe — measured on a scratch project before it was trusted:
 * structure, indexes and constraints through `including all`, the foreign keys it leaves behind
 * re-added, RLS and the comment carried over, and with *Copy data* the rows, identity values kept
 * and each sequence moved past them.
 */
export function DuplicateTableDialog({
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
  const refresh = useRefreshTable(projectRef);
  const facts = useProjectPart<TableFacts | null>(projectRef, "table-facts", { schema, table }, { enabled: open });
  const [name, setName] = useState(`${table}_duplicate`);
  const [withData, setWithData] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const known = facts.status === "ready" ? facts.data : null;
  let sql: string | null = null;
  let problem: string | null = null;
  if (known) {
    try {
      sql = duplicateTable(schema, table, name, known, withData);
    } catch (e) {
      problem = e instanceof Error ? e.message : "This copy cannot be built.";
    }
  }

  const close = () => {
    setName(`${table}_duplicate`);
    setWithData(false);
    setConfirming(false);
    setError(null);
    onOpenChange(false);
  };

  const confirm = () =>
    start(async () => {
      try {
        const res = await duplicateTableAction(projectRef, schema, table, name, withData);
        if (!res.ok) return setError(res.reason);
        close();
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the table list.");
      }
    });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-sm">
              Duplicate table <span className="font-mono">{table}</span>
            </SheetTitle>
            <SheetDescription>A new table with the same columns, constraints, indexes and foreign keys.</SheetDescription>
          </SheetHeader>

          {isWaiting(facts) ? (
            <p className="px-4 text-sm text-muted-foreground">Reading the table…</p>
          ) : !known ? (
            <p className="px-4 text-sm text-destructive">{reasonOf(facts) ?? "This table no longer exists."}</p>
          ) : (
            <div className="space-y-5 px-4 pb-6">
              <label className="block space-y-1.5">
                <span className="text-sm text-foreground">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 font-mono text-xs" />
              </label>
              <label className="flex items-start gap-3">
                <Checkbox checked={withData} onCheckedChange={(v) => setWithData(v === true)} className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm text-foreground">Copy data</span>
                  <span className="block text-xs text-muted-foreground">
                    Every row, in one statement. On a large table this holds a lock for as long as it takes.
                  </span>
                </span>
              </label>
            </div>
          )}

          <SheetFooter>
            <Button size="sm" disabled={sql == null} onClick={() => { setError(null); setConfirming(true); }}>
              Duplicate
            </Button>
            {known && problem ? <p className="text-xs text-subtle">{problem}</p> : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action={`Duplicate table as ${name}`}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={name}
        sql={sql}
        problem={problem}
        warning={
          known?.rls ? (
            <p>
              Policies are not copied, as in the original. The copy has row level security on and no policies,
              so no client key can read or write it until some are added.
            </p>
          ) : null
        }
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
