"use client";

import { useMemo, useState } from "react";
import { IconEye, IconFilter, IconLock, IconTable, IconWorld } from "@tabler/icons-react";
import type { TableEntry } from "@/lib/table-editor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { TableMenu } from "./table-menu";
import { useTableUrl } from "./url";

/** Views read the same way tables do, so they are listed together with a different icon. */
const isView = (kind: string) => kind === "v" || kind === "m";

type Kinds = { tables: boolean; views: boolean; rlsOnly: boolean };
const ALL: Kinds = { tables: true, views: true, rlsOnly: false };

export function TableList({
  schema,
  tables,
  table,
  exposed,
  query,
  collapsed,
}: {
  schema: string;
  tables: TableEntry[];
  table: string | null;
  /** Whether PostgREST serves this schema. Null when unreadable — then no icon at all. */
  exposed: boolean | null;
  /** The sidebar's search box lives in the shell; its text arrives here. */
  query: string;
  collapsed: boolean;
}) {
  const { set, pending } = useTableUrl();
  const [kinds, setKinds] = useState<Kinds>(ALL);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tables.filter((t) => {
      if (!(isView(t.kind) ? kinds.views : kinds.tables)) return false;
      if (kinds.rlsOnly && !t.rls) return false;
      return q === "" || t.name.toLowerCase().includes(q);
    });
  }, [tables, query, kinds]);

  const filtered = kinds.tables !== ALL.tables || kinds.views !== ALL.views || kinds.rlsOnly;

  return (
    <>
      {!collapsed ? (
        <div className="flex items-center gap-1 px-3 pb-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]">
                <IconFilter size={12} stroke={1.5} />
                {filtered ? "Filtered" : "Filter"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 space-y-2 p-3 text-xs">
              {(
                [
                  ["tables", "Tables"],
                  ["views", "Views"],
                  ["rlsOnly", "RLS enabled only"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-2">
                  {label}
                  <Switch
                    checked={kinds[key]}
                    onCheckedChange={(v) => setKinds((k) => ({ ...k, [key]: v }))}
                  />
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <span className="ml-auto text-[11px] text-subtle tabular-nums">{shown.length}</span>
        </div>
      ) : null}

      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pb-3 transition-opacity",
          pending && "opacity-50",
        )}
      >
        {shown.length === 0 ? (
          collapsed ? null : (
            <p className="px-3 py-6 text-center text-xs text-subtle">
              {tables.length === 0 ? "No tables in this schema." : "No match."}
            </p>
          )
        ) : (
          shown.map((t) => (
            <button
              key={t.name}
              onClick={() => set({ table: t.name, page: "1", sort: null, filter: [], q: null })}
              title={collapsed ? t.name : undefined}
              className={cn(
                "group/row flex w-full items-center gap-2 py-1.5 text-left text-xs",
                collapsed ? "justify-center px-0" : "px-3",
                t.name === table
                  ? cn(
                      "border-l-2 border-primary bg-muted text-foreground",
                      collapsed ? "" : "pl-2.5",
                    )
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {isView(t.kind) ? (
                <IconEye size={14} stroke={1.5} className="shrink-0 text-subtle" />
              ) : (
                <IconTable size={14} stroke={1.5} className="shrink-0 text-subtle" />
              )}
              {collapsed ? null : (
                <>
                  <span className="truncate">{t.name}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {exposed ? (
                      <IconWorld
                        size={12}
                        stroke={1.5}
                        className="text-subtle"
                        title={`Served through the API — schema ${schema} is exposed by PostgREST`}
                      />
                    ) : null}
                    {t.rls ? (
                      <IconLock size={12} stroke={1.5} className="text-subtle" title="RLS enabled" />
                    ) : null}
                    <TableMenu
                      schema={schema}
                      entry={t}
                      onViewDefinition={() => set({ table: t.name, view: "definition" })}
                    />
                  </span>
                </>
              )}
            </button>
          ))
        )}
      </nav>
    </>
  );
}
