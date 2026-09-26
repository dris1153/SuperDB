"use client";

import { useState, useTransition } from "react";
import { editTable, type TableFacts, type TableState } from "@/lib/ddl-table-statements";
import { editTable as editTableAction } from "@/lib/table-ddl-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";

/**
 * The original's Edit table panel, at the table level: name, description, RLS, Realtime. Columns are
 * edited where they already are — the Table Editor. Save shows the statement first, and the server
 * rebuilds it from what the catalog says when it runs.
 */
export function EditTableSheet({
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
  const before: TableState | null =
    facts.status === "ready" && facts.data
      ? { name: table, comment: facts.data.comment ?? "", rls: facts.data.rls, realtime: facts.data.realtime }
      : null;

  const [draft, setDraft] = useState<TableState | null>(null);
  const [seen, setSeen] = useState<TableState | null>(null);
  if (before && (!seen || seen.comment !== before.comment || seen.rls !== before.rls || seen.realtime !== before.realtime)) {
    setSeen(before);
    setDraft(before);
  }

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  let sql: string | null = null;
  let problem: string | null = null;
  if (before && draft) {
    try {
      sql = editTable(schema, before, draft);
    } catch (e) {
      problem = e instanceof Error ? e.message : "This change cannot be built.";
    }
  }

  const close = () => {
    setSeen(null);
    setConfirming(false);
    setError(null);
    onOpenChange(false);
  };

  const confirm = () =>
    start(async () => {
      if (!draft) return;
      try {
        const res = await editTableAction(projectRef, schema, table, draft);
        if (!res.ok) return setError(res.reason);
        close();
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the table.");
      }
    });

  const set = (patch: Partial<TableState>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-sm">
              Update table <span className="font-mono">{table}</span>
            </SheetTitle>
            <SheetDescription>Columns are changed in the Table Editor.</SheetDescription>
          </SheetHeader>

          {isWaiting(facts) ? (
            <p className="px-4 text-sm text-muted-foreground">Reading the table…</p>
          ) : !draft ? (
            <p className="px-4 text-sm text-destructive">{reasonOf(facts) ?? "This table no longer exists."}</p>
          ) : (
            <div className="space-y-5 px-4 pb-6">
              <label className="block space-y-1.5">
                <span className="text-sm text-foreground">Name</span>
                <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} className="h-8 font-mono text-xs" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-foreground">Description</span>
                <Textarea value={draft.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="Optional" rows={3} />
              </label>
              <Toggle
                label="Enable Row Level Security (RLS)"
                help="Restrict access to your table by enabling RLS and writing Postgres policies."
                checked={draft.rls}
                onChange={(rls) => set({ rls })}
              />
              <Toggle
                label="Enable Realtime"
                help="Broadcast changes on this table to authorized subscribers."
                checked={draft.realtime}
                onChange={(realtime) => set({ realtime })}
              />
            </div>
          )}

          <SheetFooter>
            <Button size="sm" disabled={sql == null} onClick={() => { setError(null); setConfirming(true); }}>
              Save
            </Button>
            {draft && problem ? <p className="text-xs text-subtle">{problem}</p> : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action="Update table"
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        sql={sql}
        problem={problem}
        warning={
          before?.rls && draft && !draft.rls ? (
            <p>Without row level security every row is readable by anyone holding the project&apos;s anon key.</p>
          ) : null
        }
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="space-y-0.5">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}
