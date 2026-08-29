"use client";

import { useMemo, useState } from "react";
import { IconEye, IconLock, IconSearch, IconTable, IconWorld } from "@tabler/icons-react";
import type { TableEntry } from "@/lib/table-editor";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTableUrl } from "./url";

/** Views read the same way tables do, so they are listed together with a different icon. */
const isView = (kind: string) => kind === "v" || kind === "m";

export function TablesSidebar({
  schemas,
  schema,
  tables,
  table,
  exposed,
}: {
  schemas: string[];
  schema: string;
  tables: TableEntry[];
  table: string | null;
  /** Whether PostgREST serves this schema. Null when the setting could not be read — no icon then,
   *  because a guessed "reachable through the API" marker is worse than none. */
  exposed: boolean | null;
}) {
  const { set, pending } = useTableUrl();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? tables : tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, query]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border">
      <div className="border-b border-border p-3">
        <h1 className="mb-3 text-sm">Table Editor</h1>
        <Select
          value={schema}
          onValueChange={(next) => set({ schema: next, table: null, page: "1", sort: null })}
        >
          <SelectTrigger className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {schemas.map((s) => (
              <SelectItem key={s} value={s}>
                schema <span className="text-foreground">{s}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="p-3 pb-2">
        <div className="relative">
          <IconSearch
            size={14}
            stroke={1.5}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <nav className={cn("min-h-0 flex-1 overflow-y-auto pb-3 transition-opacity", pending && "opacity-50")}>
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">
            {tables.length === 0 ? "No tables in this schema." : "No match."}
          </p>
        ) : (
          shown.map((t) => (
            <button
              key={t.name}
              onClick={() => set({ table: t.name, page: "1", sort: null })}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                t.name === table
                  ? "border-l-2 border-primary bg-muted pl-2.5 text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {isView(t.kind) ? (
                <IconEye size={14} stroke={1.5} className="shrink-0 text-subtle" />
              ) : (
                <IconTable size={14} stroke={1.5} className="shrink-0 text-subtle" />
              )}
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
              </span>
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}
