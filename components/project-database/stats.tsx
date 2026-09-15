"use client";

import type { DbOverview, TableRow } from "@/lib/db-introspect";
import type { DiskUtil } from "@/lib/mgmt-api";
import { bytes } from "@/lib/format";
import { Stat } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isWaiting, useProjectPart, type PartState } from "@/components/use-project-part";

/**
 * The four figures across the top: size, disk, connections, tables.
 *
 * Three queries behind them, each landing on its own. `tables` is the same query the list below
 * runs — one key, one request — so the count and the list cannot disagree about what was read.
 *
 * A figure that has not arrived shows a placeholder; one the API refused shows an em dash with the
 * reason beside it. The two are different claims and the page has always kept them apart.
 */
export function DatabaseStats({ projectRef }: { projectRef: string }) {
  const overview = useProjectPart<DbOverview | null>(projectRef, "overview");
  const disk = useProjectPart<DiskUtil>(projectRef, "disk");
  const tables = useProjectPart<TableRow[]>(projectRef, "tables");

  const db = overview.status === "ready" ? overview.data : null;
  const used = disk.status === "ready" ? disk.data : null;
  const list = tables.status === "ready" ? tables.data : null;
  const unprotected = list?.filter((t) => t.schema === "public" && !t.rls).length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat
        label="Database size"
        value={<Figure state={overview}>{bytes(db?.db_bytes)}</Figure>}
        hint={<Reason state={overview} />}
      />

      <Stat
        label="Disk used"
        value={<Figure state={disk}>{bytes(used?.metrics.fs_used_bytes)}</Figure>}
        hint={
          used ? (
            `of ${bytes(used.metrics.fs_size_bytes)}`
          ) : disk.status === "refused" || disk.status === "failed" ? (
            // The reason names the fix when the grant is the problem, so it has to be reachable —
            // not parked in a `title` that only a mouse can find.
            <Tooltip>
              <TooltipTrigger className="line-clamp-2 cursor-help text-left underline decoration-dotted underline-offset-4">
                {disk.reason}
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{disk.reason}</TooltipContent>
            </Tooltip>
          ) : undefined
        }
      />

      <Stat
        label="Connections"
        value={<Figure state={overview}>{db ? db.connections : "—"}</Figure>}
        hint={db ? `max ${db.max_connections}` : <Reason state={overview} />}
      />

      <Stat
        label="Tables"
        value={<Figure state={tables}>{list?.length ?? "—"}</Figure>}
        hint={unprotected > 0 ? `${unprotected} public without RLS` : undefined}
      />
    </div>
  );
}

/**
 * Why a figure is missing, when it is missing for a reason.
 *
 * The old page used `safe()` here, which threw the reason away; the disk figure beside it used
 * `attempt()` and printed one. Two cards in the same row answering the same question differently was
 * the inconsistency, not the silence.
 */
function Reason({ state }: { state: PartState<unknown> }) {
  if (state.status !== "refused" && state.status !== "failed") return null;
  return (
    <Tooltip>
      <TooltipTrigger className="line-clamp-2 cursor-help text-left underline decoration-dotted underline-offset-4">
        {state.reason}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{state.reason}</TooltipContent>
    </Tooltip>
  );
}

/** An em dash says the API answered and had nothing; while it is still asking, neither is true. */
function Figure({ state, children }: { state: PartState<unknown>; children: React.ReactNode }) {
  if (isWaiting(state)) {
    return <Skeleton className="h-8 w-20" />;
  }
  return <>{children}</>;
}
