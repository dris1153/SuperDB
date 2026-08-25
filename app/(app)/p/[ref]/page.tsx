import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { IconArchive, IconCpu, IconDatabase, IconGitBranch } from "@tabler/icons-react";
import { resolveProject } from "@/lib/inventory";
import {
  getDiskUtil,
  getMetricsText,
  getPoolerConfig,
  listAddons,
  listBackups,
  listBranches,
  listMigrations,
  type UsageInterval,
} from "@/lib/mgmt-api";
import { dbOverview } from "@/lib/db-introspect";
import { memoryUsedPercent, parseMetrics } from "@/lib/prometheus";
import { computeLabel, regionCountry, regionLabel, statusLabel } from "@/lib/regions";
import { attempt, safe } from "@/lib/safe";
import { bytes, date } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { GetConnected } from "@/components/get-connected";
import { RegionFlag } from "@/components/region-flag";
import { ServiceUsage } from "@/components/service-usage";
import { StatusDots } from "@/components/status-dots";

export const dynamic = "force-dynamic";

const INTERVALS: UsageInterval[] = ["15min", "30min", "1hr", "3hr", "1day", "3day"];

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ interval?: string }>;
}) {
  const [{ ref }, { interval: rawInterval }] = await Promise.all([params, searchParams]);
  const interval = INTERVALS.includes(rawInterval as UsageInterval)
    ? (rawInterval as UsageInterval)
    : "1hr";

  const found = await resolveProject(ref);
  if (!found) notFound();
  const { token, connection, project } = found;

  const [addons, branches, migrations, backups, disk, overview, metricsText, pooler] =
    await Promise.all([
      safe(() => listAddons(token, ref)),
      safe(() => listBranches(token, ref)),
      safe(() => listMigrations(token, ref)),
      safe(() => listBackups(token, ref)),
      attempt(() => getDiskUtil(token, ref)),
      safe(() => dbOverview(token, ref)),
      attempt(() => getMetricsText(token, ref)),
      safe(() => getPoolerConfig(token, ref)),
    ]);

  const compute = computeLabel(addons?.selected_addons ?? []);
  const branch = branches?.find((b) => b.is_default) ?? branches?.[0];
  const migration = migrations?.[migrations.length - 1];
  const backup = backups?.backups?.[0];
  const memory = metricsText.ok ? memoryUsedPercent(parseMetrics(metricsText.data)) : null;
  const diskPercent =
    disk.ok && disk.data.metrics.fs_size_bytes > 0
      ? Math.round((disk.data.metrics.fs_used_bytes / disk.data.metrics.fs_size_bytes) * 100)
      : null;

  // Reasons come from the API response rather than from an assumption about what OAuth allows, so a
  // scope the user can fix reads differently from a limit only Supabase can lift.
  const notes: string[] = [];
  if (!disk.ok) notes.push(`Disk: ${disk.reason}`);
  if (!metricsText.ok) notes.push(`Memory: ${metricsText.reason}`);
  else if (memory === null) notes.push("Memory: the metrics feed did not include it.");

  const primaryPooler = pooler?.find((p) => p.database_type === "PRIMARY") ?? pooler?.[0];
  const projectUrl = `https://${ref}.supabase.co`;

  const transactionPooler =
    pooler?.find((p) => p.pool_mode === "transaction")?.connection_string ??
    primaryPooler?.connection_string ??
    null;
  // Supabase returns no session-mode row; its own dashboard derives the string by swapping the
  // transaction pooler port. Looking for pool_mode "session" matched nothing, which is why the
  // Direct tab reported it unavailable.
  const sessionPooler = transactionPooler?.replace(":6543", ":5432") ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-12 p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="space-y-8">
          <header className="space-y-3">
            <h1 className="text-4xl">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{projectUrl}</span>
              <CopyButton value={projectUrl} />
            </div>
          </header>

          {/* GitHub is absent on purpose: the Management API exposes no way to know whether a
              repository is connected, and printing "No repository connected" would be asserting a
              fact we cannot check. */}
          <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
            <Tile icon={<StatusDots status={project.status} />} label="Status">
              {statusLabel(project.status)}
            </Tile>
            <Tile icon={<IconCpu size={20} stroke={1.5} />} label="Compute">
              <Badge variant="outline" className="rounded-md font-mono text-[11px]">{compute}</Badge>
            </Tile>
            <Tile icon={<IconGitBranch size={20} stroke={1.5} />} label="Recent branch">
              {branch ? branch.name : "No branches"}
            </Tile>
            <Tile icon={<IconDatabase size={20} stroke={1.5} />} label="Last migration">
              {migration ? (migration.name ?? migration.version) : "No migrations"}
            </Tile>
            <Tile icon={<IconArchive size={20} stroke={1.5} />} label="Last backup">
              {backup ? date(backup.inserted_at) : "No backups"}
            </Tile>
          </div>
        </div>

        {/* Dotted canvas with the database card floating inside it, as the dashboard does. */}
        <div className="relative flex min-h-80 items-center justify-center rounded-lg border border-border bg-[radial-gradient(var(--color-subtle)_0.5px,transparent_0.5px)] [background-size:16px_16px]">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-3 shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 rounded-md bg-primary p-1.5 text-primary-foreground">
                  <IconDatabase size={15} stroke={1.75} />
                </span>
                <div>
                  <div className="text-sm text-foreground">Primary Database</div>
                  <div className="text-xs text-muted-foreground">{regionLabel(project.region)}</div>
                  <div className="font-mono text-xs text-subtle">
                    {project.region} · {compute.toLowerCase()}
                  </div>
                </div>
              </div>
              <RegionFlag country={regionCountry(project.region)} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs">
              <Metric label="Disk" value={diskPercent === null ? null : `${diskPercent}%`} />
              <Metric label="RAM" value={memory === null ? null : `${memory}%`} />
              <Metric
                label=""
                value={overview ? `${overview.connections}/${overview.max_connections} conns` : null}
              />
              <Metric label="Size" value={overview ? bytes(overview.db_bytes) : null} />
            </div>

            {notes.length > 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-subtle">{notes.join(" ")}</p>
            ) : null}
          </div>
        </div>
      </div>

      <GetConnected
        info={{
          projectRef: ref,
          projectUrl,
          dbHost: project.database?.host ?? null,
          transactionPooler,
          sessionPooler,
        }}
      />

      {/* Behind Suspense so everything above paints without waiting on the analytics call. */}
      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg border border-border bg-card/50" />}>
        <ServiceUsage token={token} projectRef={ref} interval={interval} />
      </Suspense>
    </div>
  );
}

function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-[11px] uppercase tracking-wider text-subtle">{label}</div>
        <div className="mt-1 truncate text-base text-foreground">{children}</div>
      </div>
    </div>
  );
}

/** A metric the API refused shows an em dash rather than a zero, which would be a lie. */
function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="whitespace-nowrap">
      {label ? <span className="text-muted-foreground">{label} </span> : null}
      <span className={value === null ? "text-subtle" : "text-foreground"}>{value ?? "—"}</span>
    </span>
  );
}
