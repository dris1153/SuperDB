import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconLock, IconLockOpen } from "@tabler/icons-react";
import { resolveProject } from "@/lib/inventory";
import { getDiskUtil, getHealth, listApiKeys } from "@/lib/mgmt-api";
import { dbOverview, listTables } from "@/lib/db-introspect";
import { safe } from "@/lib/safe";
import { bytes, count, date } from "@/lib/format";
import { Badge, Card, Empty, Stat } from "@/components/ui";
import { ProjectStatus, ServiceStatus } from "@/components/status";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();
  const { token, account, project } = found;

  // Every one of these fails on a paused project; the page still renders what it can.
  const [health, disk, keys, overview, tables] = await Promise.all([
    safe(() => getHealth(token, ref)),
    safe(() => getDiskUtil(token, ref)),
    safe(() => listApiKeys(token, ref)),
    safe(() => dbOverview(token, ref)),
    safe(() => listTables(token, ref)),
  ]);

  const unprotected = tables?.filter((t) => t.schema === "public" && !t.rls).length ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-fg">
        <IconArrowLeft size={15} stroke={1.5} /> Projects
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl">{project.name}</h1>
        <ProjectStatus status={project.status} />
        <span className="font-mono text-xs text-fg-subtle">{ref}</span>
        <div className="ml-auto text-right text-sm">
          <div className="text-fg-muted">{account.email}</div>
          <div className="text-xs text-fg-subtle">
            {project.organization_slug} · {project.region} · PG {project.database?.version ?? "—"} · created {date(project.created_at)}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Database size" value={bytes(overview?.db_bytes)} />
        <Stat
          label="Disk used"
          value={bytes(disk?.metrics.fs_used_bytes)}
          hint={disk ? `of ${bytes(disk.metrics.fs_size_bytes)}` : undefined}
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
        <h2 className="text-sm text-fg-muted">Services</h2>
        {health && health.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {health.map((s) => <ServiceStatus key={s.name} service={s} />)}
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">Health unavailable — the project may be paused.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-fg-muted">Tables</h2>
        {!tables ? (
          <Empty>Could not query this database. Paused projects and restricted tokens return nothing here.</Empty>
        ) : tables.length === 0 ? (
          <Empty>No user tables yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-2xl text-sm">
              <thead className="border-b border-line bg-panel text-left text-xs text-fg-subtle">
                <tr>
                  {["Schema", "Table", "Rows (est.)", "Size", "Columns", "RLS"].map((h) => (
                    <th key={h} className="px-3 py-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => (
                  <tr key={`${t.schema}.${t.name}`} className="border-b border-line last:border-0 hover:bg-ash/40">
                    <td className="px-3 py-2 font-mono text-xs text-fg-subtle">{t.schema}</td>
                    <td className="px-3 py-2 text-fg">{t.name}</td>
                    <td className="px-3 py-2 tabular-nums text-fg-muted">{count(t.est_rows)}</td>
                    <td className="px-3 py-2 tabular-nums text-fg-muted">{bytes(t.total_bytes)}</td>
                    <td className="px-3 py-2 tabular-nums text-fg-subtle">{t.columns}</td>
                    <td className="px-3 py-2">
                      {t.rls ? (
                        <Badge tone="brand"><IconLock size={12} stroke={1.5} /> on</Badge>
                      ) : (
                        <Badge tone={t.schema === "public" ? "warn" : "neutral"}>
                          <IconLockOpen size={12} stroke={1.5} /> off
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-fg-muted">API keys</h2>
        {keys && keys.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => (
              <Badge key={k.id ?? k.name} className="font-mono">
                {k.name}{k.prefix ? ` · ${k.prefix}…` : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">No keys returned. Values are never revealed here.</p>
        )}
      </section>
    </div>
  );
}
