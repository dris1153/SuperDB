"use client";

import dynamic from "next/dynamic";
import { Select as SelectPrimitive } from "radix-ui";
import { IconCircleCheckFilled, IconLock } from "@tabler/icons-react";
import { COMMANDS, takesCheck, takesUsing, type PolicySpec } from "@/lib/policy-statements";
import { FOREGROUND, KEYWORD } from "@/components/sql-editor/editor-theme";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RolePicker } from "./role-picker";

const ExpressionEditor = dynamic(() => import("./expression-editor"), { ssr: false, loading: () => <Skeleton className="h-7 w-full" /> });

/** `Table on clause` — a label naming the keyword it fills, as the original's do. */
const Label = ({ text, keyword }: { text: string; keyword?: string }) => (
  <span className="flex items-center gap-1.5 text-sm text-foreground">
    {text}
    {keyword ? <><code className="rounded border border-border bg-muted px-1 font-mono text-xs">{keyword}</code> clause</> : null}
  </span>
);

/** The original's behaviours, each with the line it explains itself with. */
const BEHAVIOURS = [
  { value: "permissive", label: "Permissive", description: 'Policies are combined using the "OR" Boolean operator' },
  { value: "restrictive", label: "Restrictive", description: 'Policies are combined using the "AND" Boolean operator' },
];

/** One fixed line of the frame: its number, a keyword, and the rest. */
const Fixed = ({ n, keyword, rest }: { n: number; keyword: string; rest?: string }) => (
  <div className="flex font-mono text-sm leading-7">
    <span className="w-10 shrink-0 pr-4 text-right text-subtle">{n}</span>
    <span>
      <span style={{ color: KEYWORD }}>{keyword}</span>
      {rest ? <span style={{ color: FOREGROUND }}> {rest}</span> : null}
    </span>
  </div>
);

/**
 * The details and the statement they build, as the original lays them out: fields in a grid above,
 * the `create policy` frame below with its fixed lines read-only and the expressions editable.
 */
export function PolicyDetails({ draft, set, tables, roles, editing, version }: {
  draft: PolicySpec;
  set: (patch: Partial<PolicySpec>) => void;
  tables: string[];
  roles: string[];
  editing: boolean;
  version: number;
}) {
  const using = takesUsing(draft.command);
  const check = takesCheck(draft.command);
  let n = 5;
  const usingStart = n + 2;
  const usingLines = Math.max(1, draft.using.split("\n").length);
  const checkStart = using ? usingStart + usingLines + 2 : usingStart;

  return (
    <>
      <div className="grid gap-x-5 gap-y-5 p-6 sm:grid-cols-2">
        <label className="space-y-2">
          <Label text="Policy Name" />
          <Input id="policy-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Provide a name for your policy" className="h-10" />
        </label>
        <div className="space-y-2">
          <Label text="Table" keyword="on" />
          <Select value={draft.table} onValueChange={(table) => set({ table })} disabled={editing}>
            <SelectTrigger className="h-10 w-full font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(tables.includes(draft.table) ? tables : [draft.table, ...tables]).map((t) => (
                <SelectItem key={t} value={t} className="font-mono">{draft.schema}.{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label text="Policy Behavior" keyword="as" />
          <Select value={draft.permissive ? "permissive" : "restrictive"} onValueChange={(v) => set({ permissive: v === "permissive" })} disabled={editing}>
            <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" align="start" className="p-1">
              {/* Only the label is ItemText, so the trigger shows the name and not its explanation. */}
              {BEHAVIOURS.map((b) => (
                <SelectPrimitive.Item key={b.value} value={b.value}
                  className="flex cursor-default gap-3 rounded-md px-2 py-2 outline-hidden select-none focus:bg-accent">
                  <span className="mt-0.5 size-4 shrink-0">
                    <SelectPrimitive.ItemIndicator><IconCircleCheckFilled size={16} /></SelectPrimitive.ItemIndicator>
                  </span>
                  <span>
                    <span className="block text-sm text-foreground"><SelectPrimitive.ItemText>{b.label}</SelectPrimitive.ItemText></span>
                    <span className="block text-sm text-muted-foreground">{b.description}</span>
                  </span>
                </SelectPrimitive.Item>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label text="Policy Command" keyword="for" />
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {COMMANDS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={draft.command === c} disabled={editing} onClick={() => set({ command: c })}
                className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60",
                  draft.command === c ? "border-foreground/40 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                <span className={cn("size-3 rounded-full border", draft.command === c ? "border-4 border-foreground" : "border-subtle")} />
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label text="Target Roles" keyword="to" />
          <RolePicker roles={roles} value={draft.roles} onChange={(r) => set({ roles: r })} />
        </div>
      </div>

      <div className="border-t border-border py-3">
        <div className="flex items-center gap-4 pb-1 font-mono text-xs tracking-wider text-subtle uppercase">
          <span className="flex w-10 justify-end pr-4"><IconLock size={14} /></span>
          Use options above to edit
        </div>
        <Fixed n={1} keyword="create policy" rest={`"${draft.name || "policy_name"}"`} />
        <Fixed n={2} keyword="on" rest={`"${draft.schema}"."${draft.table}"`} />
        <Fixed n={3} keyword="as" rest={draft.permissive ? "PERMISSIVE" : "RESTRICTIVE"} />
        <Fixed n={4} keyword="for" rest={draft.command} />
        <Fixed n={5} keyword="to" rest={draft.roles.length ? draft.roles.join(", ") : "public"} />
        {using ? (
          <>
            <Fixed n={++n} keyword="using" rest="(" />
            <ExpressionEditor key={`u${version}`} initialValue={draft.using} onChange={(v) => set({ using: v })} firstLine={usingStart}
              hint="-- Provide a SQL expression for the using statement" />
            <Fixed n={usingStart + usingLines} keyword={check ? ")" : ");"} />
          </>
        ) : null}
        {check ? (
          <>
            <Fixed n={checkStart - 1} keyword="with check" rest="(" />
            <ExpressionEditor key={`c${version}-${checkStart}`} initialValue={draft.check} onChange={(v) => set({ check: v })} firstLine={checkStart}
              hint="-- Provide a SQL expression for the with check statement" />
            <Fixed n={checkStart + Math.max(1, draft.check.split("\n").length)} keyword=");" />
          </>
        ) : null}
      </div>
    </>
  );
}
