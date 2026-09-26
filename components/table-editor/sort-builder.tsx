"use client";

import { useState } from "react";
import { IconArrowsSort, IconPlus, IconX } from "@tabler/icons-react";
import { serialiseSort, type ColumnInfo, type SortKey } from "@/lib/table-view";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTableUrl } from "./url";

export function SortBuilder({ columns, sort }: { columns: ColumnInfo[]; sort: SortKey[] }) {
  const { set } = useTableUrl();
  const [draft, setDraft] = useState<SortKey[]>(sort);
  const [open, setOpen] = useState(false);

  const show = (next: boolean) => {
    if (next) setDraft(sort);
    setOpen(next);
  };

  const apply = (keys: SortKey[]) => {
    set({ sort: keys.length > 0 ? serialiseSort(keys) : null, page: "1" });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <IconArrowsSort size={13} stroke={1.5} />
          Sort
          {sort.length > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {sort.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-3">
        {draft.length === 0 ? (
          <p className="pb-2 text-xs text-subtle">
            No sort. Rows come back in primary key order, which is what keeps paging stable.
          </p>
        ) : (
          <div className="space-y-2 pb-2">
            {draft.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  value={s.column}
                  onValueChange={(v) =>
                    setDraft((d) => d.map((k, n) => (n === i ? { ...k, column: v } : k)))
                  }
                >
                  <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
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
                <Select
                  value={s.dir}
                  onValueChange={(v) =>
                    setDraft((d) =>
                      d.map((k, n) => (n === i ? { ...k, dir: v as SortKey["dir"] } : k)),
                    )
                  }
                >
                  <SelectTrigger size="sm" className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">ascending</SelectItem>
                    <SelectItem value="desc">descending</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => setDraft((d) => d.filter((_, n) => n !== i))}
                  aria-label="Remove sort"
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
            onClick={() => setDraft((d) => [...d, { column: columns[0].name, dir: "asc" }])}
          >
            <IconPlus size={13} stroke={1.5} /> Add sort
          </Button>
          <div className="ml-auto flex gap-2">
            {sort.length > 0 ? (
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
