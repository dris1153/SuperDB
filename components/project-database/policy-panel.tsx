"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { alterPolicySql, COMMANDS, createPolicySql, takesCheck, takesUsing, type DbPolicy, type PolicySpec } from "@/lib/policy-statements";
import { specFromPolicy } from "@/lib/policy-model";
import { POLICY_TEMPLATES } from "@/lib/policy-templates";
import { createPolicy, updatePolicy } from "@/lib/policy-actions";
import { quoteIdent, quoteQualified } from "@/lib/sql-ident";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckboxFilter } from "@/components/auth/checkbox-filter";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";
import { cn } from "@/lib/utils";

const SqlBodyEditor = dynamic(() => import("./sql-body-editor"), { ssr: false, loading: () => <Skeleton className="h-24 w-full" /> });

export type PolicyTarget = { table: string; policy: DbPolicy | null };

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start">
      <span className="pt-2 text-sm text-foreground">{label}</span>
      <div className="space-y-1.5">
        {children}
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

const Line = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div className="flex gap-4 font-mono text-xs leading-6">
    <span className="w-5 shrink-0 text-right text-subtle">{n}</span>
    <span className="text-muted-foreground">{children}</span>
  </div>
);

/**
 * The original's policy editor: details on the left, the statement as a frame whose fixed lines are
 * read-only and whose expressions are editable, templates on the right. Edit locks table, command
 * and behaviour — `alter policy` cannot change them.
 */
export function PolicyPanel({ target, onClose, projectRef, projectName, schema, roles }: {
  target: PolicyTarget | null;
  onClose: () => void;
  projectRef: string;
  projectName: string;
  schema: string;
  roles: string[];
}) {
  const refresh = useRefreshTable(projectRef);
  const [draft, setDraft] = useState<PolicySpec | null>(null);
  const [version, setVersion] = useState(0);
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
  const templates = POLICY_TEMPLATES.filter((t) => !editing || t.command === editing.command);
  const applyTemplate = (t: (typeof POLICY_TEMPLATES)[number]) => {
    set(editing ? { using: t.using, check: t.check } : { name: t.name, command: t.command, roles: t.roles, using: t.using, check: t.check });
    setVersion((v) => v + 1);
  };

  let n = 0;
  return (
    <>
      <Sheet open={target !== null} onOpenChange={(next) => !next && close()}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-5xl!">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="text-base font-normal">
              {editing ? <>Edit policy <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{editing.name}</code></> : "Create a new Row Level Security policy"}
            </SheetTitle>
          </SheetHeader>

          {draft ? (
            <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="space-y-5 border-r border-border p-6">
                <Row label="Policy Name">
                  <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Provide a name for your policy" className="h-9" />
                </Row>
                <Row label="Table">
                  <Input value={`${schema}.${draft.table}`} disabled className="h-9 font-mono" />
                </Row>
                <Row label="Policy Behavior">
                  <Select value={draft.permissive ? "permissive" : "restrictive"} onValueChange={(v) => set({ permissive: v === "permissive" })} disabled={!!editing}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permissive">Permissive</SelectItem>
                      <SelectItem value="restrictive">Restrictive</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
                <Row label="Policy Command">
                  <div className="flex flex-wrap gap-2">
                    {COMMANDS.map((c) => (
                      <button key={c} type="button" disabled={!!editing} onClick={() => set({ command: c })}
                        className={cn("rounded-md border px-3 py-1.5 font-mono text-xs disabled:cursor-not-allowed",
                          draft.command === c ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                        {c}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label="Target Roles" hint={draft.roles.length ? undefined : "Defaults to all (public) roles if none selected"}>
                  <CheckboxFilter label="Target roles" title="Select roles" options={roles.map((r) => ({ value: r, label: r }))} value={draft.roles} onChange={(r) => set({ roles: r })} />
                </Row>

                <div className="overflow-hidden rounded-md border border-border bg-muted/20 py-2">
                  <div className="px-3">
                    <Line n={++n}>create policy {quoteIdent(draft.name || "policy_name")}</Line>
                    <Line n={++n}>on {quoteQualified(schema, draft.table)}</Line>
                    <Line n={++n}>as {draft.permissive ? "permissive" : "restrictive"}</Line>
                    <Line n={++n}>for {draft.command.toLowerCase()}</Line>
                    <Line n={++n}>to {draft.roles.length ? draft.roles.join(", ") : "public"}</Line>
                    {takesUsing(draft.command) ? <Line n={++n}>using (</Line> : null}
                  </div>
                  {takesUsing(draft.command) ? (
                    <SqlBodyEditor key={`u${version}`} initialValue={draft.using} onChange={(using) => set({ using })} className="h-28 border-y border-border" />
                  ) : null}
                  <div className="px-3">
                    {takesUsing(draft.command) ? <Line n={++n}>{takesCheck(draft.command) ? ")" : ");"}</Line> : null}
                    {takesCheck(draft.command) ? <Line n={++n}>with check (</Line> : null}
                  </div>
                  {takesCheck(draft.command) ? (
                    <SqlBodyEditor key={`c${version}`} initialValue={draft.check} onChange={(check) => set({ check })} className="h-28 border-y border-border" />
                  ) : null}
                  {takesCheck(draft.command) ? <div className="px-3"><Line n={++n}>);</Line></div> : null}
                </div>
              </div>

              <aside className="space-y-3 p-6">
                <h3 className="text-sm text-foreground">Templates</h3>
                <p className="text-sm text-muted-foreground">
                  {editing ? "Expressions for this command, to start from." : "Select a template to use as a starting point for your policy."}
                </p>
                {templates.map((t) => (
                  <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                    className="block w-full space-y-1 rounded-md border border-border px-4 py-3 text-left hover:bg-muted/40">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{t.title}</span>
                      <span className="rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground">{t.command}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </button>
                ))}
              </aside>
            </div>
          ) : null}

          <SheetFooter className="mt-auto flex-row items-center justify-end gap-2 border-t border-border px-6 py-3">
            {draft && problem && (draft.name || editing) ? <span className="mr-auto text-xs text-subtle">{problem}</span> : null}
            <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
            <Button size="sm" disabled={!sql} onClick={() => { setError(null); setConfirming(true); }}>Save policy</Button>
          </SheetFooter>
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
