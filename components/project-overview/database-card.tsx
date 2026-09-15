"use client";

import { IconDatabase } from "@tabler/icons-react";
import type { DbOverview } from "@/lib/db-introspect";
import type { Addon, DiskUtil } from "@/lib/mgmt-api";
import { computeLabel, regionCountry, regionLabel } from "@/lib/regions";
import { bytes } from "@/lib/format";
import { RegionFlag } from "@/components/region-flag";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectPart, type PartState } from "@/components/use-project-part";

/**
 * The card floating on the dotted canvas: where the database is, and how full.
 *
 * Region and compute size are the project's own; the four figures underneath each come from their
 * own part, so the card is readable before any of them land.
 *
 * A figure the API refused shows an em dash, never a zero — a zero is a measurement, and reporting
 * one nobody took is the failure this whole page is careful about. The reasons print underneath, as
 * they did on the server, because a missing OAuth scope is something the reader can go and fix.
 */
export function DatabaseCard({ projectRef, region }: { projectRef: string; region: string }) {
  const addons = useProjectPart<{ selected_addons: Addon[] }>(projectRef, "addons");
  const disk = useProjectPart<DiskUtil>(projectRef, "disk");
  const metrics = useProjectPart<{ memoryPercent: number | null }>(projectRef, "metrics");
  const overview = useProjectPart<DbOverview | null>(projectRef, "overview");

  const compute = addons.status === "ready" ? computeLabel(addons.data.selected_addons) : null;

  const diskPercent =
    disk.status === "ready" && disk.data.metrics.fs_size_bytes > 0
      ? Math.round((disk.data.metrics.fs_used_bytes / disk.data.metrics.fs_size_bytes) * 100)
      : null;

  const memory = metrics.status === "ready" ? metrics.data.memoryPercent : null;
  const db = overview.status === "ready" ? overview.data : null;

  // Reasons come from the API's own answer rather than from an assumption about what OAuth allows,
  // so a scope the user can fix reads differently from a limit only Supabase can lift.
  const notes = [
    reasonOf("Disk", disk),
    reasonOf("Memory", metrics),
    metrics.status === "ready" && metrics.data.memoryPercent === null
      ? "Memory: the metrics feed did not include it."
      : null,
  ].filter((note): note is string => note !== null);

  return (
    <div className="relative flex min-h-80 items-center justify-center rounded-lg border border-border bg-[radial-gradient(var(--color-subtle)_0.5px,transparent_0.5px)] [background-size:16px_16px]">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-3 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 rounded-md bg-primary p-1.5 text-primary-foreground">
              <IconDatabase size={15} stroke={1.75} />
            </span>
            <div>
              <div className="text-sm text-foreground">Primary Database</div>
              <div className="text-xs text-muted-foreground">{regionLabel(region)}</div>
              <div className="font-mono text-xs text-subtle">
                {region}
                {compute ? ` · ${compute.toLowerCase()}` : ""}
              </div>
            </div>
          </div>
          <RegionFlag country={regionCountry(region)} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs">
          <Metric label="Disk" pending={disk.status === "pending"} value={diskPercent === null ? null : `${diskPercent}%`} />
          <Metric label="RAM" pending={metrics.status === "pending"} value={memory === null ? null : `${memory}%`} />
          <Metric
            label=""
            pending={overview.status === "pending"}
            value={db ? `${db.connections}/${db.max_connections} conns` : null}
          />
          <Metric label="Size" pending={overview.status === "pending"} value={db ? bytes(db.db_bytes) : null} />
        </div>

        {notes.length > 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-subtle">{notes.join(" ")}</p>
        ) : null}
      </div>
    </div>
  );
}

const reasonOf = (label: string, state: PartState<unknown>) =>
  state.status === "refused" || state.status === "failed" ? `${label}: ${state.reason}` : null;

/**
 * A figure the API refused shows an em dash rather than a zero, which would be a lie. While it is
 * still in flight it shows a placeholder instead, because an em dash claims an answer has arrived.
 */
function Metric({ label, value, pending }: { label: string; value: string | null; pending: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {label ? <span className="text-muted-foreground">{label} </span> : null}
      {pending ? (
        <Skeleton className="inline-block h-4 w-10 align-middle" />
      ) : (
        <span className={value === null ? "text-subtle" : "text-foreground"}>{value ?? "—"}</span>
      )}
    </span>
  );
}
