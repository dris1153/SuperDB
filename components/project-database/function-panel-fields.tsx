"use client";

import dynamic from "next/dynamic";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { COMMON_TYPES } from "@/lib/ddl-build";
import { BEHAVIORS, RETURN_PSEUDO, type FunctionOptions, type FunctionSpec } from "@/lib/function-statements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfigParams, Security } from "./function-advanced";
import { SchemaSelect } from "./schema-select";

const SqlBodyEditor = dynamic(() => import("./sql-body-editor"), { ssr: false, loading: () => <Skeleton className="h-80 w-full" /> });

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded border border-border bg-muted px-1 font-mono text-xs text-foreground">{children}</code>
);

/** Label on the left, control and help on the right — the original's horizontal form row. */
function Row({ label, help, children }: { label: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <span className="pt-2 text-sm text-foreground">{label}</span>
      <div className="space-y-1.5">
        {children}
        {help ? <p className="text-sm text-muted-foreground">{help}</p> : null}
      </div>
    </div>
  );
}

function TypeSelect({ value, types, extra = [], disabled, onChange }: { value: string; types: string[]; extra?: string[]; disabled?: boolean; onChange: (v: string) => void }) {
  const options = [...extra, ...COMMON_TYPES.filter((t) => types.includes(t)), ...types.filter((t) => !COMMON_TYPES.includes(t))];
  const list = options.includes(value) || !value ? options : [value, ...options];
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder="Choose a type" />
      </SelectTrigger>
      <SelectContent>
        {[...new Set(list)].map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The original's sections: identity, type, arguments, definition, advanced settings. */
export function FunctionPanelFields({
  projectRef,
  draft,
  set,
  options,
  editing,
  advanced,
  setAdvanced,
  editorKey,
}: {
  projectRef: string;
  draft: FunctionSpec;
  set: (patch: Partial<FunctionSpec>) => void;
  options: FunctionOptions;
  editing: boolean;
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
  editorKey: string;
}) {
  const section = "space-y-4 border-b border-border px-6 py-6";

  return (
    <>
      <div className={section}>
        <Row label="Schema" help={<>Tables made in the table editor will be in <Code>public</Code></>}>
          <SchemaSelect projectRef={projectRef} schema={draft.schema} onChange={(schema) => set({ schema })} className="h-9 w-full" />
        </Row>
        <Row label="Name of function" help="Name will also be used for the function name in postgres">
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name of function" className="h-9" />
        </Row>
      </div>

      <div className={section}>
        <Row label="Type">
          <Select value={draft.kind} onValueChange={(kind) => set({ kind: kind as FunctionSpec["kind"] })} disabled={editing}>
            <SelectTrigger className="h-9 w-full">{draft.kind === "function" ? "Function" : "Stored procedure"}</SelectTrigger>
            <SelectContent>
              <SelectItem value="function">Function — for query logic, triggers, and RPC calls</SelectItem>
              <SelectItem value="procedure">Stored procedure — for batch or multi-step tasks that manage transactions</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        {draft.kind === "function" ? (
          <Row label="Return type">
            <TypeSelect value={draft.returnType} types={options.types} extra={RETURN_PSEUDO} disabled={editing} onChange={(returnType) => set({ returnType })} />
          </Row>
        ) : null}
      </div>

      <div className={section}>
        <div>
          <h3 className="text-base text-foreground">Arguments</h3>
          <p className="text-sm text-muted-foreground">Arguments can be referenced in the function body using either names or numbers.</p>
        </div>
        {editing && draft.args.length === 0 ? <p className="text-sm text-muted-foreground">No argument for this function</p> : null}
        {draft.args.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={a.name} disabled={editing} placeholder="argument_name" className="h-9"
              onChange={(e) => set({ args: draft.args.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <TypeSelect value={a.type} types={options.types} disabled={editing}
              onChange={(type) => set({ args: draft.args.map((x, j) => (j === i ? { ...x, type } : x)) })} />
            {editing ? null : (
              <button type="button" aria-label="Remove argument" onClick={() => set({ args: draft.args.filter((_, j) => j !== i) })}
                className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground">
                <IconTrash size={14} />
              </button>
            )}
          </div>
        ))}
        {editing ? null : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => set({ args: [...draft.args, { name: "", type: "integer" }] })}>
            <IconPlus size={14} /> Add a new argument
          </Button>
        )}
      </div>

      <div className="border-b border-border pt-6">
        <div className="px-6 pb-4">
          <h3 className="text-base text-foreground">Definition</h3>
          <p className="text-sm text-muted-foreground">
            The language below should be written in <Code>{draft.language}</Code>.
            {editing ? null : <><br />Change the language in the Advanced Settings below.</>}
          </p>
        </div>
        <SqlBodyEditor key={editorKey} initialValue={draft.definition} onChange={(definition) => set({ definition })} />
      </div>

      <div className="space-y-6 px-6 py-6">
        <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-6 py-4">
          <span>
            <span className="block text-sm text-foreground">Show advanced settings</span>
            <span className="block text-sm text-muted-foreground">These are settings that might be familiar for Postgres developers</span>
          </span>
          <Switch checked={advanced} onCheckedChange={setAdvanced} />
        </label>

        {advanced ? (
          <div className="space-y-6">
            <Row label="Language">
              <Select value={draft.language} onValueChange={(language) => set({ language })}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(options.languages.includes(draft.language) ? options.languages : [draft.language, ...options.languages]).map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            {draft.kind === "function" ? (
              <Row label="Behavior">
                <Select value={draft.behavior} onValueChange={(b) => set({ behavior: b as FunctionSpec["behavior"] })}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BEHAVIORS.map((b) => <SelectItem key={b.code} value={b.code}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
            ) : null}
            <ConfigParams draft={draft} set={set} />
            <Security value={draft.securityDefiner} onChange={(securityDefiner) => set({ securityDefiner })} />
          </div>
        ) : null}
      </div>
    </>
  );
}
