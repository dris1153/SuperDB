"use client";

import { useState } from "react";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconPlus, IconSearch } from "@tabler/icons-react";
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
import { Button } from "@/components/ui/button";
import { useSidebarCollapsed } from "./column-prefs";
import { NewTableSheet } from "./new-table-sheet";
import { TableList } from "./table-list";
import { useTableUrl } from "./url";

/**
 * The sidebar shell: schema picker, search box, and the collapse toggle. The list itself lives in
 * `table-list.tsx` — together they were past the repo's 200-line rule.
 */
export function TablesSidebar({
  schemas,
  schema,
  tables,
  table,
  exposed,
  projectRef,
  projectName,
}: {
  schemas: string[];
  schema: string;
  tables: TableEntry[];
  table: string | null;
  exposed: boolean | null;
  projectRef: string;
  projectName: string;
}) {
  const { set } = useTableUrl();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [creating, setCreating] = useState(false);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border transition-[width]",
        collapsed ? "w-12" : "w-60",
      )}
    >
      <div className={cn("border-b border-border", collapsed ? "p-2" : "p-3")}>
        <div className="mb-3 flex items-center gap-2">
          {collapsed ? null : <h1 className="truncate text-sm">Table Editor</h1>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ml-auto rounded p-1 text-subtle hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <IconLayoutSidebarLeftExpand size={15} stroke={1.5} />
            ) : (
              <IconLayoutSidebarLeftCollapse size={15} stroke={1.5} />
            )}
          </button>
        </div>

        {collapsed ? null : (
          <Select
            value={schema}
            onValueChange={(next) =>
              set({ schema: next, table: null, page: "1", sort: null, filter: [], q: null })
            }
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
        )}
      </div>

      {collapsed ? null : (
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
      )}

      <TableList
        schema={schema}
        tables={tables}
        table={table}
        exposed={exposed}
        query={query}
        collapsed={collapsed}
        projectRef={projectRef}
        projectName={projectName}
      />

      {collapsed ? null : (
        <div className="border-t border-border p-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full gap-1 text-xs"
            onClick={() => setCreating(true)}
          >
            <IconPlus size={13} stroke={1.5} /> New table
          </Button>
        </div>
      )}

      <NewTableSheet
        open={creating}
        onOpenChange={setCreating}
        projectRef={projectRef}
        projectName={projectName}
        schema={schema}
      />
    </aside>
  );
}
