import { notFound } from "next/navigation";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { resolveProject } from "@/lib/inventory";
import { getDiskUtil, getHealth, listApiKeys } from "@/lib/mgmt-api";
import { dbOverview, listTables } from "@/lib/db-introspect";
import { attempt, safe } from "@/lib/safe";
import { bytes, count } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectStatus, ServiceStatus } from "@/components/status";

export const dynamic = "force-dynamic";

const HEAD = "text-xs font-normal text-subtle";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();
  const { token, connection, project } = found;

  // Every one of these fails on a paused project too; the page still renders what it can.
  // Disk and keys are attempted rather than pre-judged by connection kind, so the reason shown is
  // whatever Supabase actually answered — a missing scope reads differently from a platform gap.
  const [health, diskResult, keysResult, overview, tables] = await Promise.all([
    safe(() => getHealth(token, ref)),
    attempt(() => getDiskUtil(token, ref)),
    attempt(() => listApiKeys(token, ref)),
    safe(() => dbOverview(token, ref)),
    safe(() => listTables(token, ref)),
  ]);

  const disk = diskResult.ok ? diskResult.data : null;
  const keys = keysResult.ok ? keysResult.data : null;

  const unprotected =
    tables?.filter((t) => t.schema === "public" && !t.rls).length ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl">Database</h1>
        <ProjectStatus status={project.status} />
        <span className="font-mono text-xs text-subtle">{ref}</span>
        <div className="ml-auto text-right text-xs text-subtle">
          {connection.display_name} · {project.region} · PG{" "}
          {project.database?.version ?? "—"}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Database size" value={bytes(overview?.db_bytes)} />
        <Stat
          label="Disk used"
          value={bytes(disk?.metrics.fs_used_bytes)}
          hint={
            disk ? (
              `of ${bytes(disk.metrics.fs_size_bytes)}`
            ) : diskResult.ok ? undefined : (
              // Full reason on hover: it names the fix when the grant is the problem.
              <span title={diskResult.reason} className="line-clamp-2">
                {diskResult.reason}
              </span>
            )
          }
        />
        <Stat
          label="Connections"
          value={overview ? overview.connections : "—"}
          hint={overview ? `max ${overview.max_connections}` : undefined}
        />
        <Stat
          label="Tables"
          value={tables?.length ?? "—"}
          hint={
            unprotected > 0 ? `${unprotected} public without RLS` : undefined
          }
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm text-muted-foreground">Services</h2>
        {health && health.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {health.map((s) => (
              <ServiceStatus key={s.name} service={s} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">
            Health unavailable — the project may be paused.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-muted-foreground">Tables</h2>
        {!tables ? (
          <Empty>
            Could not query this database. Paused projects and restricted tokens
            return nothing here.
          </Empty>
        ) : tables.length === 0 ? (
          <Empty>No user tables yet.</Empty>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table className="min-w-2xl">
              <TableHeader className="bg-card">
                <TableRow className="hover:bg-transparent">
                  {[
                    "Schema",
                    "Table",
                    "Rows (est.)",
                    "Size",
                    "Columns",
                    "RLS",
                  ].map((h) => (
                    <TableHead key={h} className={HEAD}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => (
                  <TableRow key={`${t.schema}.${t.name}`}>
                    <TableCell className="font-mono text-xs text-subtle">
                      {t.schema}
                    </TableCell>
                    <TableCell className="text-foreground">{t.name}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {count(t.est_rows)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {bytes(t.total_bytes)}
                    </TableCell>
                    <TableCell className="tabular-nums text-subtle">
                      {t.columns}
                    </TableCell>
                    <TableCell>
                      {t.rls ? (
                        <Badge
                          variant="outline"
                          className="rounded-full border-brand-border text-primary"
                        >
                          <IconLock size={12} stroke={1.5} /> on
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            t.schema === "public"
                              ? "rounded-full border-warn/40 text-warn"
                              : "rounded-full"
                          }
                        >
                          <IconLockOpen size={12} stroke={1.5} /> off
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-muted-foreground">API keys</h2>
        {!keysResult.ok ? (
          <p className="text-sm text-subtle">{keysResult.reason}</p>
        ) : keys && keys.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => (
              <Badge
                key={k.id ?? k.name}
                variant="outline"
                className="rounded-full font-mono"
              >
                {k.name}
                {k.prefix ? ` · ${k.prefix}…` : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">
            No keys returned. Values are never revealed here.
          </p>
        )}
      </section>
    </div>
  );
}
