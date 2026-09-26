"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { FunctionSpec } from "@/lib/function-statements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded border border-border bg-muted px-1 font-mono text-xs text-foreground">{children}</code>
);

/** The panel's advanced settings that are lists and choices: configuration parameters, security. */
export function ConfigParams({ draft, set }: { draft: FunctionSpec; set: (patch: Partial<FunctionSpec>) => void }) {
  const update = (i: number, patch: Partial<FunctionSpec["config"][number]>) =>
    set({ config: draft.config.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm text-foreground">Configuration Parameters</h4>
        <p className="text-sm text-muted-foreground">Values are SQL, set as written — <Code>{"''"}</Code> for an empty search path.</p>
      </div>
      {draft.config.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={p.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="search_path" className="h-9 font-mono" />
          <Input value={p.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="''" className="h-9 font-mono" />
          <button type="button" aria-label="Remove parameter" onClick={() => set({ config: draft.config.filter((_, j) => j !== i) })}
            className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground">
            <IconTrash size={14} />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => set({ config: [...draft.config, { name: "", value: "" }] })}>
        <IconPlus size={14} /> Add a new config
      </Button>
    </div>
  );
}

export function Security({ value, onChange }: { value: boolean; onChange: (definer: boolean) => void }) {
  const option = (definer: boolean, label: string, who: string) => (
    <label className={cn("flex cursor-pointer gap-3 rounded-md border px-4 py-3", value === definer ? "border-primary/60 bg-primary/5" : "border-border")}>
      <input type="radio" name="security" checked={value === definer} onChange={() => onChange(definer)} className="mt-1 accent-(--primary)" />
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-sm text-muted-foreground">
          Function is to be executed with the privileges of the user that <span className="text-foreground">{who}</span>.
        </span>
      </span>
    </label>
  );
  return (
    <div className="space-y-3">
      <h4 className="text-sm text-foreground">Type of Security</h4>
      {option(false, "SECURITY INVOKER", "calls it")}
      {option(true, "SECURITY DEFINER", "created it")}
    </div>
  );
}
