"use client";

import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

/**
 * A filter as the original's is: a popover of checkboxes, applied on Save.
 *
 * **Not a `Select`, which is what this replaced and why it broke.** The shared `SelectContent`
 * positions itself `item-aligned`, and Radix only runs that positioning when the trigger holds a
 * `SelectValue` — its code checks `context.valueNode` first. To show the label while nothing was
 * chosen, the trigger rendered a plain span instead, so the popup opened and was never placed: both
 * filters clicked and showed nothing.
 *
 * **Several can be ticked, and nothing ticked means no filter.** Ticking is a draft until Save — a
 * box ticked by mistake and the popover closed changes nothing. Clear applies the empty selection at
 * once, because a reset that needs a second click to take effect is a reset people think they did.
 */
export function CheckboxFilter({
  label,
  title,
  options,
  value,
  onChange,
}: {
  label: string;
  /** The line at the top of the popover — "Select registration type". */
  title: string;
  options: FilterOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);

  const active = options.filter((o) => value.includes(o.value));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Every opening starts from what is applied, so an abandoned draft does not come back.
        if (next) setDraft(value);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 border-dashed", active.length > 0 && "border-solid")}
        >
          {label}
          {active.length > 0 ? (
            <span className="text-muted-foreground">: {active.map((o) => o.label).join(", ")}</span>
          ) : null}
          <IconChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 gap-0 p-0">
        <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{title}</div>

        <div className="space-y-0.5 p-1.5">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted/60"
            >
              <Checkbox
                checked={draft.includes(option.value)}
                onCheckedChange={(next) =>
                  setDraft((current) =>
                    next === true
                      ? [...current, option.value]
                      : current.filter((v) => v !== option.value),
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
