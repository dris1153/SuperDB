"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconPlus, IconRefresh } from "@tabler/icons-react";
import type { Policy } from "@/lib/table-editor";
import type { ColumnInfo, SortKey } from "@/lib/table-view";
import type { Filter } from "@/lib/table-filter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FilterBuilder } from "./filter-builder";
import { RlsPanel } from "./rls-panel";
import { SortBuilder } from "./sort-builder";
import { SearchBox } from "./search-box";
import { ExportMenu } from "./export-menu";
import { useDensity } from "./density";
import type { Density } from "./column-prefs";

/**
 * The controls above the grid.
 *
 * Two things from Supabase's own toolbar are deliberately absent rather than disabled: the role
 * switcher, which this API cannot do at all — the query role is a member of no other role — and the
 * "ask AI" affordance, which has no backend here. A permanently dead control is a lie rather than a
 * roadmap, the same call `project-nav.tsx` makes about Integrations. `Insert` is disabled instead of
 * removed because writing is a real future phase, not an impossibility.
 */
export function Toolbar({
  table,
  rls,
  policies,
  projectRef,
  schema,
  columns,
  filters,
  sort,
  search,
  urlQuery,
  page,
  size,
}: {
  projectRef: string;
  schema: string;
  table: string;
  rls: boolean;
  policies: Policy[];
  columns: ColumnInfo[];
  filters: Filter[];
  sort: SortKey[];
  search: string;
  urlQuery: { sort?: string; filter?: string[]; search?: string };
  page: number;
  size: number;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const { density, setDensity } = useDensity();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <SearchBox search={search} />
      <FilterBuilder columns={columns} filters={filters} />
      <SortBuilder columns={columns} sort={sort} />

      <div className="ml-auto flex items-center gap-2">
        <Select value={density} onValueChange={(v) => setDensity(v as Density)}>
          <SelectTrigger size="sm" className="h-7 w-28 text-xs" aria-label="Row density">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
          </SelectContent>
        </Select>

        <ExportMenu
          projectRef={projectRef}
          schema={schema}
          table={table}
          urlQuery={urlQuery}
          page={page}
          size={size}
        />

        <RlsPanel table={table} rls={rls} policies={policies} />

        <button
          onClick={() => startRefresh(() => router.refresh())}
          aria-label="Refresh rows"
          className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted"
        >
          <IconRefresh
            size={14}
            stroke={1.5}
            className={cn(refreshing && "animate-spin")}
          />
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            {/* A disabled button swallows pointer events, so the tooltip needs a live wrapper. */}
            <span className="inline-flex">
              <Button size="sm" disabled className="h-7 gap-1 text-xs">
                <IconPlus size={13} stroke={1.5} /> Insert
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>This editor is read-only. Writing is not built yet.</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
