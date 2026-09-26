"use client";

import { useEffect, useState, useTransition } from "react";
import { createFunctionSql, updateFunctionSql, type DbFunction, type FunctionOptions, type FunctionSpec } from "@/lib/function-statements";
import { blankFunction, specFrom } from "@/lib/function-read";
import { createFunction, readFunctionOptions, updateFunction } from "@/lib/function-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";
import { FunctionPanelFields } from "./function-panel-fields";

/** What the panel was opened for: a new function, an edit, or a duplicate of one. */
export type FunctionTarget = { mode: "create" } | { mode: "edit" | "duplicate"; fn: DbFunction };

/**
 * The original's function panel. Edit locks type, return type and arguments — a new signature is a
 * new function — and the server rebuilds from the catalog's signature, not the draft's.
 */
export function FunctionPanel({
  target,
  onClose,
  projectRef,
  projectName,
  schema,
}: {
  target: FunctionTarget | null;
  onClose: () => void;
  projectRef: string;
  projectName: string;
  schema: string;
}) {
  const refresh = useRefreshTable(projectRef);
  const [options, setOptions] = useState<FunctionOptions | null>(null);
  const [draft, setDraft] = useState<FunctionSpec | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [seen, setSeen] = useState<FunctionTarget | null>(null);
  if (target && seen !== target) {
    setSeen(target);
    setAdvanced(false);
    setDraft(
      target.mode === "create"
        ? blankFunction(schema)
        : target.mode === "edit"
          ? specFrom(target.fn)
          : { ...specFrom(target.fn), name: `${target.fn.name}_duplicate` },
    );
  }

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const open = target !== null;
  const editing = target?.mode === "edit" ? target.fn : null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    readFunctionOptions(projectRef).then((o) => !cancelled && setOptions(o));
    return () => {
      cancelled = true;
    };
  }, [open, projectRef]);

  let sql: string | null = null;
  let problem: string | null = null;
  if (draft && options) {
    try {
      sql = editing ? updateFunctionSql(editing, draft, options) : createFunctionSql(draft, options);
    } catch (e) {
      problem = e instanceof Error ? e.message : "This function cannot be built.";
    }
  }

  const close = () => {
    setSeen(null);
    setDraft(null);
    setConfirming(false);
    setError(null);
    onClose();
  };

  const confirm = () =>
    start(async () => {
      if (!draft) return;
      try {
        const res = editing
          ? await updateFunction(projectRef, editing.schema, editing.name, editing.identity, draft)
          : await createFunction(projectRef, draft);
        if (!res.ok) return setError(res.reason);
        close();
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the functions.");
      }
    });

  const title = editing
    ? <>Edit <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{editing.name}</code></>
    : target?.mode === "duplicate" ? "Duplicate function" : "Add a new function";

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && close()}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl!">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="text-base font-normal">{title}</SheetTitle>
          </SheetHeader>

          {!draft || !options ? (
            <p className="p-6 text-sm text-muted-foreground">Reading the project&apos;s types and languages…</p>
          ) : (
            <FunctionPanelFields projectRef={projectRef} draft={draft} set={(p) => setDraft({ ...draft, ...p })} options={options}
              editing={!!editing} advanced={advanced} setAdvanced={setAdvanced}
              editorKey={seen ? `${seen.mode}:${"fn" in seen ? `${seen.fn.name}(${seen.fn.identity})` : ""}` : ""} />
          )}

          <SheetFooter className="mt-auto flex-row items-center justify-end gap-2 border-t border-border px-6 py-3">
            {draft && problem && (draft.name || editing) ? <span className="mr-auto text-xs text-subtle">{problem}</span> : null}
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" disabled={!sql} onClick={() => { setError(null); setConfirming(true); }}>
              {editing ? "Save function" : "Create function"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action={editing ? `Update function ${editing.name}` : "Create function"}
        projectName={projectName}
        projectRef={projectRef}
        schema={draft?.schema ?? schema}
        table={editing?.name ?? draft?.name ?? ""}
        sql={sql}
        problem={problem}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
