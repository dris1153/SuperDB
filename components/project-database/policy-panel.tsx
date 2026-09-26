"use client";

import { useState, useTransition } from "react";
import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconX } from "@tabler/icons-react";
import { alterPolicySql, createPolicySql, type DbPolicy, type PolicySpec } from "@/lib/policy-statements";
import { specFromPolicy } from "@/lib/policy-model";
import type { PolicyTemplate } from "@/lib/policy-templates";
import { createPolicy, updatePolicy } from "@/lib/policy-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";
import { cn } from "@/lib/utils";
import { PolicyDetails } from "./policy-details";
import { PolicyTemplatesPanel } from "./policy-templates-panel";

export type PolicyTarget = { table: string; policy: DbPolicy | null };

/**
 * The original's policy editor: the form and its statement on the left, templates on the right
 * behind a toggle. Edit locks table, command and behaviour — `alter policy` cannot change them.
 */
export function PolicyPanel({ target, onClose, projectRef, projectName, schema, roles, tables }: {
  target: PolicyTarget | null;
  onClose: () => void;
  projectRef: string;
  projectName: string;
  schema: string;
  roles: string[];
  tables: string[];
}) {
  const refresh = useRefreshTable(projectRef);
  const [draft, setDraft] = useState<PolicySpec | null>(null);
  const [version, setVersion] = useState(0);
  const [showTemplates, setShowTemplates] = useState(true);
  const [seen, setSeen] = useState<PolicyTarget | null>(null);
  if (target && seen !== target) {
    setSeen(target);
    setVersion((v) => v + 1);
    setDraft(target.policy ? specFromPolicy(schema, target.table, target.policy)
      : { schema, table: target.table, name: "", command: "SELECT", permissive: true, roles: [], using: "", check: "" });
  }
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const editing = target?.policy ?? null;

  let sql: string | null = null;
  let problem: string | null = null;
  if (draft) {
    try {
      sql = editing ? alterPolicySql(schema, draft.table, editing, draft, roles) : createPolicySql(draft, roles);
    } catch (e) {
      problem = e instanceof Error ? e.message : "This policy cannot be built.";
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
        const res = editing ? await updatePolicy(projectRef, schema, draft.table, editing.name, draft) : await createPolicy(projectRef, draft);
        if (!res.ok) return setError(res.reason);
        close();
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the policies.");
      }
    });

  const set = (patch: Partial<PolicySpec>) => draft && setDraft({ ...draft, ...patch });
  // In edit, a template can only lend its expressions: the command it was written for is locked.
  const pick = (t: PolicyTemplate) => {
    set(editing ? { using: t.using, check: t.check } : { name: t.name, command: t.command, roles: t.roles, using: t.using, check: t.check });
    setVersion((v) => v + 1);
  };

  return (
    <>
      <Sheet open={target !== null} onOpenChange={(next) => !next && close()}>
        <SheetContent showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-6xl!"
          // The name, as the original focuses it — not the close button, which Radix would pick first.
          onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById("policy-name")?.focus(); }}>
          <div className={cn("grid h-full min-h-0", showTemplates && "md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]")}>
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-3 border-b border-border px-4 py-4">
                <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close"><IconX size={16} /></Button>
                <SheetTitle className="flex-1 text-lg font-normal">
                  {editing ? <>Edit policy <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-sm">{editing.name}</code></> : "Create a new Row Level Security policy"}
                </SheetTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowTemplates((v) => !v)} aria-label={showTemplates ? "Hide templates" : "Show templates"}>
                  {showTemplates ? <IconLayoutSidebarRightCollapse size={16} /> : <IconLayoutSidebarRightExpand size={16} />}
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {draft ? <PolicyDetails draft={draft} set={set} tables={tables} roles={roles} editing={!!editing} version={version} /> : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
                {draft && problem && (draft.name || editing) ? <span className="mr-auto text-xs text-subtle">{problem}</span> : null}
                <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
                <Button size="sm" disabled={!sql} onClick={() => { setError(null); setConfirming(true); }}>Save policy</Button>
              </div>
            </div>

            {showTemplates ? <PolicyTemplatesPanel command={editing ? editing.command : null} schema={schema} table={draft?.table ?? target?.table ?? ""} onPick={pick} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action={editing ? `Update policy ${editing.name}` : "Create policy"}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={draft?.table ?? ""}
        sql={sql}
        problem={problem}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
