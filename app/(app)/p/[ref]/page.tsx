import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconLock, IconLockOpen } from "@tabler/icons-react";
import { resolveProject } from "@/lib/inventory";
import { getDiskUtil, getHealth, listApiKeys } from "@/lib/mgmt-api";
import { dbOverview, listTables } from "@/lib/db-introspect";
import { safe } from "@/lib/safe";
import { bytes, count, date } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProjectStatus, ServiceStatus } from "@/components/status";

export const dynamic = "force-dynamic";

const HEAD = "text-xs font-normal text-subtle";

export default async function ProjectPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();
  const { token, connection, project } = found;

  // Disk utilisation and API keys answer "does not support oauth access yet" — a platform limit, not a
  // scope one. Skip the calls entirely rather than spending a round trip on a guaranteed 401.
  const viaOAuth = connection.kind === "oauth";

  // Every one of these fails on a paused project too; the page still renders what it can.
  const [health, disk, keys, overview, tables] = await Promise.all([
    safe(() => getHealth(token, ref)),
    viaOAuth ? null : safe(() => getDiskUtil(token, ref)),
    viaOAuth ? null : safe(() => listApiKeys(token, ref)),
    safe(() => dbOverview(token, ref)),
    safe(() => listTables(token, ref)),
  ]);

  const unprotected = tables?.filter((t) => t.schema === "public" && !t.rls).length ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-subtle hover:text-foreground">
        <IconArrowLeft size={15} stroke={1.5} /> Projects
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl">{project.name}</h1>
        <ProjectStatus status={project.status} />
        <span className="font-mono text-xs text-subtle">{ref}</span>
        <div className="ml-auto text-right text-sm">
          <div className="text-muted-foreground">{connection.display_name}</div>
          <div className="text-xs text-subtle">
            {project.organization_slug} · {project.region} · PG {project.database?.version ?? "—"} · created {date(project.created_at)}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Database size" value={bytes(overview?.db_bytes)} />
        <Stat
          label="Disk used"
          value={bytes(disk?.metrics.fs_used_bytes)}
          hint={
            viaOAuth
              ? "unavailable over OAuth"
              : disk
                ? `of ${bytes(disk.metrics.fs_size_bytes)}`
                : undefined
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
          hint={unprotected > 0 ? `${unprotected} public without RLS` : undefined}
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm text-muted-foreground">Services</h2>
        {health && health.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {health.map((s) => <ServiceStatus key={s.name} service={s} />)}
          </div>
        ) : (
          <p className="text-sm text-subtle">Health unavailable — the project may be paused.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-muted-foreground">Tables</h2>
        {!tables ? (
          <Empty>Could not query this database. Paused projects and restricted tokens return nothing here.</Empty>
        ) : tables.length === 0 ? (
          <Empty>No user tables yet.</Empty>
        ) : (
          <div className="rounded-lg border border-border">
            <Table className="min-w-2xl">
              <TableHeader className="bg-card">
                <TableRow className="hover:bg-transparent">
                  {["Schema", "Table", "Rows (est.)", "Size", "Columns", "RLS"].map((h) => (
                    <TableHead key={h} className={HEAD}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => (
                  <TableRow key={`${t.schema}.${t.name}`}>
                    <TableCell className="font-mono text-xs text-subtle">{t.schema}</TableCell>
                    <TableCell className="text-foreground">{t.name}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{count(t.est_rows)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{bytes(t.total_bytes)}</TableCell>
                    <TableCell className="tabular-nums text-subtle">{t.columns}</TableCell>
                    <TableCell>
                      {t.rls ? (
                        <Badge variant="outline" className="rounded-full border-brand-border text-primary">
                          <IconLock size={12} stroke={1.5} /> on
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={t.schema === "public" ? "rounded-full border-warn/40 text-warn" : "rounded-full"}
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
        {viaOAuth ? (
          <p className="text-sm text-subtle">
            Unavailable over OAuth — reading API keys needs the Secrets: Read scope, which also grants access
            to project secrets. Connect this account with an access token if you need it.
          </p>
        ) : keys && keys.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => (
              <Badge key={k.id ?? k.name} variant="outline" className="rounded-full font-mono">
                {k.name}{k.prefix ? ` · ${k.prefix}…` : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">No keys returned. Values are never revealed here.</p>
        )}
      </section>
    </div>
  );
}
