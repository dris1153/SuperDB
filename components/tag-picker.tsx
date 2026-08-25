"use client";

import { useMemo, useState } from "react";
import { IconCheck, IconPlus, IconTag, IconX } from "@tabler/icons-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * Creatable multi-select. Existing tags are shown first so that "prod" gets reused rather than
 * retyped as "Prod" — the picker is the main defence against near-duplicate tags.
 */
export function TagPicker({
  available,
  value,
  onChange,
}: {
  available: string[];
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const typed = normalise(query);
  const canCreate = typed.length > 0 && !available.includes(typed) && !value.includes(typed);

  const options = useMemo(
    () => [...new Set([...available, ...value])].sort(),
    [available, value],
  );

  function toggle(tag: string) {
    const next = value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag];
    onChange(next);
  }

  function create() {
    if (!canCreate) return;
    onChange([...value, typed]);
    setQuery("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <Badge key={tag} variant="outline" className="rounded-full">
            {tag}
            <button
              type="button"
              onClick={() => toggle(tag)}
              aria-label={`Remove ${tag}`}
              className="ml-1 text-subtle hover:text-foreground"
            >
              <IconX size={11} stroke={2} />
            </button>
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="xs">
              <IconTag size={13} stroke={1.5} />
              {value.length === 0 ? "Add tags" : "Edit"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Find or create a tag…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {options.length === 0 && !canCreate ? (
                  <CommandEmpty>No tags yet. Type to create one.</CommandEmpty>
                ) : null}

                {options.length > 0 ? (
                  <CommandGroup>
                    {options.map((tag) => (
                      <CommandItem key={tag} value={tag} onSelect={() => toggle(tag)}>
                        <IconCheck
                          size={14}
                          stroke={1.5}
                          className={value.includes(tag) ? "text-primary" : "opacity-0"}
                        />
                        {tag}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}

                {canCreate ? (
                  <CommandGroup>
                    <CommandItem value={`create-${typed}`} onSelect={create}>
                      <IconPlus size={14} stroke={1.5} />
                      Create &ldquo;{typed}&rdquo;
                    </CommandItem>
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
