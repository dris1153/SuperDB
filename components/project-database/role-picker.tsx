"use client";

import { IconX } from "@tabler/icons-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The original's roles field: an input-shaped box of chips; nothing chosen means `public`. */
export function RolePicker({ roles, value, onChange }: { roles: string[]; value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (r: string) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-left text-sm dark:bg-input/30">
          {value.length === 0 ? (
            <span className="px-1 text-muted-foreground">Defaults to all (public) roles if none selected</span>
          ) : (
            value.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xs text-foreground">
                {r}
                <span role="button" tabIndex={0} aria-label={`Remove ${r}`} onClick={(e) => { e.stopPropagation(); toggle(r); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggle(r); } }} className="text-muted-foreground hover:text-foreground">
                  <IconX size={10} />
                </span>
              </span>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto p-1.5">
        {roles.map((r) => (
          <label key={r} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 font-mono text-xs hover:bg-muted/60">
            <Checkbox checked={value.includes(r)} onCheckedChange={() => toggle(r)} />
            {r}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
