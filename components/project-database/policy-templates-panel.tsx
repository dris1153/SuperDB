"use client";

import { useState } from "react";
import { HoverCard } from "radix-ui";
import { IconCheck, IconCopy, IconSearch } from "@tabler/icons-react";
import type { PolicyCommand } from "@/lib/policy-statements";
import { POLICY_TEMPLATES, type PolicyTemplate } from "@/lib/policy-templates";
import { Input } from "@/components/ui/input";
import { SqlCode } from "@/components/table-editor/sql-code";
import { cn } from "@/lib/utils";

/** The original's colour per command on a template card. */
const TONE: Record<PolicyCommand, string> = {
  SELECT: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  INSERT: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  UPDATE: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  DELETE: "border-red-500/40 bg-red-500/10 text-red-400",
  ALL: "border-border text-muted-foreground",
};

/** `teams` in a description is code, as the original renders it. */
const withCode = (text: string) =>
  text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") ? <code key={i} className="rounded border border-border bg-muted px-1 font-mono text-xs text-foreground">{part.slice(1, -1)}</code> : part,
  );

export function PolicyTemplatesPanel({ command, schema, table, onPick }: {
  command: PolicyCommand | null;
  schema: string;
  table: string;
  onPick: (t: PolicyTemplate) => void;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const templates = POLICY_TEMPLATES.filter(
    (t) => (!command || t.command === command) && (!needle || `${t.name} ${t.description}`.toLowerCase().includes(needle)),
  );

  return (
    <aside className="flex min-h-0 flex-col border-l border-border">
      <div className="border-b border-border px-6 pt-4">
        <span className="inline-block border-b-2 border-foreground pb-3 text-sm text-foreground">Templates</span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" className="h-10 pl-9" />
        </div>
        {templates.length === 0 ? <p className="text-sm text-muted-foreground">No templates found.</p> : null}
        {templates.map((t) => (
          <HoverCard.Root key={t.id} openDelay={200} closeDelay={100}>
            <HoverCard.Trigger asChild>
              <button type="button" onClick={() => onPick(t)}
                className="grid w-full grid-cols-[4.5rem_1fr] gap-4 rounded-lg border border-border px-6 py-5 text-left hover:bg-muted/40">
                <span className={cn("h-fit w-fit rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider", TONE[t.command])}>{t.command}</span>
                <span className="space-y-2">
                  <span className="block text-sm text-foreground">{t.name}</span>
                  <span className="block text-sm text-muted-foreground">{withCode(t.description)}</span>
                </span>
              </button>
            </HoverCard.Trigger>
            <HoverCard.Portal>
              <HoverCard.Content side="left" align="start" sideOffset={12}
                className="z-50 w-[30rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 shadow-lg">
                <Preview code={t.statement(schema, table)} />
              </HoverCard.Content>
            </HoverCard.Portal>
          </HoverCard.Root>
        ))}
      </div>
    </aside>
  );
}

/** The statement a template stands for, as the original previews it on hover, with a copy. */
function Preview({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused outside a secure context; the text is on screen to select.
    }
  };
  return (
    <div className="relative">
      <SqlCode code={code} />
      <button type="button" onClick={copy} aria-label="Copy SQL"
        className="absolute top-2 right-2 rounded-md border border-border bg-popover p-1.5 text-muted-foreground hover:text-foreground">
        {copied ? <IconCheck size={14} className="text-primary" /> : <IconCopy size={14} />}
      </button>
    </div>
  );
}
