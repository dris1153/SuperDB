import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { ProjectStatus } from "@/components/status";
import { DatabaseApiKeys } from "@/components/project-database/api-keys";
import { DatabaseServices } from "@/components/project-database/services";
import { DatabaseStats } from "@/components/project-database/stats";
import { DatabaseTables } from "@/components/project-database/tables-card";

export const dynamic = "force-dynamic";

/**
 * The shell, as on the overview page: resolve the project for the 404 and the header, then let each
 * section fetch its own part.
 *
 * Measured 2026-09-15, this page awaited five calls together — 875–941 ms, plus 254 ms to resolve —
 * and rendered nothing until the slowest landed. Health and the table query were the slow two, and
 * the header waited behind both.
 */
export default async function ProjectDatabasePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;

  const found = await resolveProject(ref);
  if (!found) notFound();
  const { connection, project } = found;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl">Database</h1>
        <ProjectStatus status={project.status} />
        <span className="font-mono text-xs text-subtle">{ref}</span>
        <div className="ml-auto text-right text-xs text-subtle">
          {/* Fields rather than the project: `resolveProject` hands back the upstream body verbatim,
              and only these three are on the page. */}
          {connection.display_name} · {project.region} · PG {project.database?.version ?? "—"}
        </div>
      </header>

      <DatabaseStats projectRef={ref} />
      <DatabaseServices projectRef={ref} />
      <DatabaseTables projectRef={ref} />
      <DatabaseApiKeys projectRef={ref} />
    </div>
  );
}
