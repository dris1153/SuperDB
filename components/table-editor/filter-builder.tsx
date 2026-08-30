"use client";

import { useState } from "react";
import { IconFilter, IconPlus, IconX } from "@tabler/icons-react";
import type { ColumnInfo } from "@/lib/table-view";
import {
  FILTER_OPS,
  opLabel,
  opTakesValue,
  serialiseFilter,
  type Filter,
  type FilterOp,
} from "@/lib/table-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTableUrl } from "./url";

export function FilterBuilder({
  columns,
  filters,
}: {
  columns: ColumnInfo[];
  filters: Filter[];
}) {
  const { set } = useTableUrl();
  const [draft, setDraft] = useState<Filter[]>(filters);
  const [open, setOpen] = useState(false);

  // The popover is a draft surface: nothing re-queries until Apply, so a half-typed value never
  // becomes a database round trip.
  const show = (next: boolean) => {
    if (next) setDraft(filters.length > 0 ? filters : []);
    setOpen(next);
  };

  const apply = (list: Filter[]) => {
    const usable = list.filter((f) => !opTakesValue(f.op) || f.value !== "");
    set({ filter: usable.map(serialiseFilter), page: "1" });
    setOpen(false);
  };

  const update = (i: number, patch: Partial<Filter>) =>
    setDraft((d) => d.map((f, n) => (n === i ? { ...f, ...patch } : f)));

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <IconFilter size={13} stroke={1.5} />
          Filter
          {filters.length > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {filters.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[30rem] p-3">
        {draft.length === 0 ? (
          <p className="pb-2 text-xs text-subtle">No filters. Rows are filtered in SQL, not on the page.</p>
        ) : (
          <div className="space-y-2 pb-2">
            {draft.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select value={f.column} onValueChange={(v) => update(i, { column: v })}>
                  <SelectTrigger size="sm" className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.op} onValueChange={(v) => update(i, { op: v as FilterOp })}>
                  <SelectTrigger size="sm" className="h-7 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {opLabel(op)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={f.value}
                  disabled={!opTakesValue(f.op)}
                  placeholder={opTakesValue(f.op) ? "value" : "—"}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className="h-7 flex-1 text-xs"
                />
                <button
                  onClick={() => setDraft((d) => d.filter((_, n) => n !== i))}
                  aria-label="Remove filter"
                  className="rounded p-1 text-subtle hover:bg-muted"
                >
                  <IconX size={13} stroke={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={columns.length === 0}
            onClick={() =>
              setDraft((d) => [...d, { column: columns[0].name, op: "eq", value: "" }])
            }
          >
            <IconPlus size={13} stroke={1.5} /> Add filter
          </Button>
          <div className="ml-auto flex gap-2">
            {filters.length > 0 ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => apply([])}>
                Clear
              </Button>
            ) : null}
            <Button size="sm" className="h-7 text-xs" onClick={() => apply(draft)}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
