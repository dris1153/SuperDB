"use client";

import { useState } from "react";
import { IconArrowUpRight, IconLink, IconPlus, IconX } from "@tabler/icons-react";
import { COMMON_TYPES, IDENTITY_TYPES } from "@/lib/ddl-build";
import { FK_ACTIONS, type ColumnSpec } from "@/lib/column-statements";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TypeIcon } from "@/components/project-database/column-tokens";
import { ForeignKeyDialog } from "./foreign-key-dialog";

/** Label and aside on the left, fields on the right — the original's panel section. */
function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border px-6 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-3">
        <h3 className="text-sm text-foreground">{title}</h3>
        {aside}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, optional, help, children }: { label: string; optional?: boolean; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-sm text-foreground">
        {label}
        {optional ? <span className="text-muted-foreground">Optional</span> : null}
      </span>
      {children}
      {help ? <span className="block text-sm text-muted-foreground">{help}</span> : null}
    </label>
  );
}

function Toggle({ label, help, checked, disabled, onChange }: { label: string; help: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-sm text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

/** The original's five sections, bar Data Privacy — see the plan for why that one is not here. */
export function ColumnPanelSections({
  projectRef,
  draft,
  set,
  types,
  sharedConstraints,
}: {
  projectRef: string;
  draft: ColumnSpec;
  set: (patch: Partial<ColumnSpec>) => void;
  types: string[];
  sharedConstraints: number;
}) {
  const [addingKey, setAddingKey] = useState(false);
  const canIdentity = IDENTITY_TYPES.has(draft.type) && !draft.array;
  const common = COMMON_TYPES.filter((t) => types.includes(t));
  const rest = types.filter((t) => !COMMON_TYPES.includes(t));

  return (
    <>
      <Section title="General">
        <Field label="Name" help={<>Recommended to use lowercase and use an underscore to separate words e.g. <code className="rounded bg-muted px-1 font-mono text-xs">column_name</code></>}>
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} className="h-9" />
        </Field>
        <Field label="Description" optional>
          <Input value={draft.comment} onChange={(e) => set({ comment: e.target.value })} className="h-9" />
        </Field>
      </Section>

      <Section
        title="Data Type"
        aside={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="https://supabase.com/docs/guides/database/tables#data-types" target="_blank" rel="noreferrer">
              <IconArrowUpRight size={14} /> About data types
            </a>
          </Button>
        }
      >
        <Field label="Type">
          <Select value={draft.type} onValueChange={(type) => set({ type, identity: draft.identity && IDENTITY_TYPES.has(type) })}>
            <SelectTrigger className="h-9 w-full" aria-label="Column type">
              <SelectValue placeholder="Choose a column type..." />
            </SelectTrigger>
            <SelectContent>
              {common.length ? (
                <SelectGroup>
                  <SelectLabel>Common</SelectLabel>
                  {common.map((t) => (
                    <SelectItem key={t} value={t}>
                      <TypeIcon type={t} /> {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {common.length && rest.length ? <SelectSeparator /> : null}
              {rest.map((t) => (
                <SelectItem key={t} value={t}>
                  <TypeIcon type={t} /> {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {canIdentity ? (
          <Check label="Is Identity" help="Automatically assign a sequential unique number to the column" checked={draft.identity}
            onChange={(identity) => set(identity ? { identity, default: "", nullable: false } : { identity })} />
        ) : (
          <Check label="Define as Array" help="Allow column to be defined as variable-dimension arrays" checked={draft.array}
            onChange={(array) => set({ array, identity: false })} />
        )}

        {draft.identity ? null : (
          <Field label="Default Value" help="Can either be a literal or an expression. When using an expression wrap your expression in brackets, e.g. (gen_random_uuid())">
            <Input value={draft.default} onChange={(e) => set({ default: e.target.value })} placeholder="NULL" className="h-9" />
          </Field>
        )}
      </Section>

      <Section title="Foreign Keys">
        {draft.foreignKeys.map((k, i) => (
          <div key={k.name ?? `new-${i}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <IconLink size={14} className="shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs">{k.schema}.{k.table}.{k.column}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                on delete {FK_ACTIONS.find((a) => a.code === k.onDelete)?.label.toLowerCase()}
              </span>
            </span>
            <button type="button" aria-label="Remove foreign key" onClick={() => set({ foreignKeys: draft.foreignKeys.filter((_, j) => j !== i) })}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <IconX size={14} />
            </button>
          </div>
        ))}
        <div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddingKey(true)}>
            <IconPlus size={14} /> Add foreign key
          </Button>
        </div>
        <ForeignKeyDialog open={addingKey} onOpenChange={setAddingKey} projectRef={projectRef}
          onAdd={(k) => set({ foreignKeys: [...draft.foreignKeys, k] })} />
      </Section>

      <Section title="Constraints">
        <Toggle label="Is Primary Key" help="A primary key indicates that a column or group of columns can be used as a unique identifier for rows in the table"
          checked={draft.primary} onChange={(primary) => set(primary ? { primary, nullable: false } : { primary })} />
        <Toggle label="Allow Nullable" help="Allow the column to assume a NULL value if no value is provided"
          checked={draft.nullable} disabled={draft.primary || draft.identity} onChange={(nullable) => set({ nullable })} />
        <Toggle label="Is unique" help="Enforce values in the column to be unique across rows" checked={draft.unique} onChange={(unique) => set({ unique })} />
        <Field label="CHECK constraint" optional help="SQL, run as written.">
          <Input value={draft.check} onChange={(e) => set({ check: e.target.value })} placeholder="length(column_name) < 500" className="h-9" />
        </Field>
        {sharedConstraints > 0 ? (
          <p className="text-sm text-muted-foreground">
            {sharedConstraints} more constraint{sharedConstraints === 1 ? "" : "s"} span this and other columns. Those are changed in SQL, not here.
          </p>
        ) : null}
      </Section>
    </>
  );
}

function Check({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-sm text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}
