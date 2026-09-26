"use client";

import { useEffect, useState, useTransition } from "react";
import { addColumnSql, alterColumnSql, blankSpec, type ColumnSpec } from "@/lib/column-statements";
import type { ColumnFacts } from "@/lib/column-facts";
import { dropColumn } from "@/lib/ddl-statements";
import { columnUsage, dropColumn as dropColumnAction, listColumnTypes } from "@/lib/ddl-actions";
import { saveColumn } from "@/lib/table-ddl-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { ColumnPanelSections } from "./column-panel-sections";
import { DdlConfirm } from "./ddl-confirm";
import { DropWarning } from "./drop-warning";
import { useRefreshTable } from "./use-refresh-table";

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
);

/**
 * The original's column panel, for adding (`column` null) and editing alike. Save shows the
 * statement; the server re-reads the column and rebuilds it before it runs.
 */
export function ColumnPanel({
  open,
  column,
  onClose,
  projectRef,
  projectName,
  schema,
  table,
}: {
  open: boolean;
  /** The column being edited, or null to add one. */
  column: string | null;
  onClose: () => void;
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
}) {
  const refresh = useRefreshTable(projectRef);
  const facts = useProjectPart<ColumnFacts>(projectRef, "column-facts", { schema, table, column: column ?? "" }, { enabled: open });
  const known = facts.status === "ready" && facts.data.found ? facts.data : null;
  const before = column ? (known?.column ?? null) : null;

  const [types, setTypes] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<ColumnSpec | null>(null);
  const [seeded, setSeeded] = useState<ColumnFacts | null>(null);
  if (open && known && seeded !== known) {
    setSeeded(known);
    setDraft(column ? known.column : blankSpec());
  }

  const [mode, setMode] = useState<"save" | "drop" | null>(null);
  const [usage, setUsage] = useState<{ total: number; filled: number } | null | undefined>(undefined);
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
  if (mode === "drop" && column && known) {
    try {
      sql = dropColumn(schema, table, column, known.columnCount);
    } catch (e) {
      problem = e instanceof Error ? e.message : "This column cannot be dropped.";
    }
  } else if (draft && known && types) {
    try {
      sql = before ? alterColumnSql(schema, table, before, draft, known, types) : addColumnSql(schema, table, draft, known, types);
    } catch (e) {
      problem = e instanceof Error ? e.message : "This change cannot be built.";
    }
  } else if (types && types.length === 0) {
    problem = "Could not read the project's type list, so no column type can be checked.";
  }

  const close = () => {
    setSeeded(null);
    setDraft(null);
    setMode(null);
    setError(null);
    onClose();
  };

  const askDrop = () => {
    if (!column) return;
    setError(null);
    setUsage(undefined);
    setMode("drop");
    columnUsage(projectRef, schema, table, column).then(setUsage, () => setUsage(null));
  };

  const confirm = () =>
    start(async () => {
      if (!draft) return;
      try {
        const res = mode === "drop" && column
          ? await dropColumnAction(projectRef, schema, table, column)
          : await saveColumn(projectRef, schema, table, column, draft);
        if (!res.ok) return setError(res.reason);
        close();
        refresh();
      } catch {
        // The statement may already have run; on a path with no undo, do not imply it did not.
        setError("The request failed before it answered. Reload and check the column before retrying.");
      }
    });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && close()}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-4xl!">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="flex flex-wrap items-center gap-1.5 text-base font-normal">
              {column ? <>Update column <Code>{column}</Code> from <Code>{table}</Code></> : <>Add new column to <Code>{table}</Code></>}
            </SheetTitle>
          </SheetHeader>

          {isWaiting(facts) || !types ? (
            <p className="p-6 text-sm text-muted-foreground">Reading the column…</p>
          ) : !known || !draft ? (
            <p className="p-6 text-sm text-destructive">{reasonOf(facts) ?? (column ? `There is no column ${column}.` : `There is no table ${table}.`)}</p>
          ) : (
            <ColumnPanelSections projectRef={projectRef} draft={draft} set={(p) => setDraft({ ...draft, ...p })} types={types} sharedConstraints={known.sharedConstraints} />
          )}

          <SheetFooter className="mt-auto flex-row items-center justify-between border-t border-border px-6 py-3">
            <div>
              {column && known ? (
                <Button variant="outline" size="sm" className="text-destructive" onClick={askDrop}>
                  Delete column
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {draft && problem && mode !== "drop" ? <span className="text-xs text-subtle">{problem}</span> : null}
              <Button variant="outline" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button size="sm" disabled={!draft || !!problem} onClick={() => { setError(null); setMode("save"); }}>
                Save
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={mode !== null}
        onOpenChange={(next) => !next && setMode(null)}
        action={mode === "drop" ? `Drop ${column}` : column ? `Update column ${column}` : "Add column"}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        sql={sql}
        problem={problem}
        warning={mode === "drop" ? (usage === undefined ? <p>Reading how many rows hold a value…</p> : <DropWarning usage={usage} />) : null}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
