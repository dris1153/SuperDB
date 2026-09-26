"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { ALL_KINDS, ENTITY_TYPES, type EntityKind } from "@/lib/table-entities";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The original's Entity Type filter: everything ticked to start, each box applies at once, and
 * *Select only* on hover. Not `CheckboxFilter` — that one starts empty and applies on Save.
 */
export function EntityTypeFilter({ value, onChange }: { value: EntityKind[]; onChange: (next: EntityKind[]) => void }) {
  const narrowed = value.length !== ALL_KINDS.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 gap-1.5", !narrowed && "border-dashed")}>
          Entity Type
          <IconChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-0 p-0">
        <div className="px-3 pt-3 pb-1 text-xs text-muted-foreground">Show entity types</div>
        <div className="p-1.5">
          {ENTITY_TYPES.map(({ kind, label }) => (
            <div key={kind} className="group flex items-center justify-between rounded-md px-1.5 py-1 hover:bg-muted/60">
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={value.includes(kind)}
                  onCheckedChange={(next) =>
                    onChange(next === true ? ALL_KINDS.filter((k) => k === kind || value.includes(k)) : value.filter((k) => k !== kind))
                  }
                />
                {label}
              </label>
              <button
                type="button"
                onClick={() => onChange([kind])}
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
              >
                Select only
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
