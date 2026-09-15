import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { isMoving, isPaused } from "@/lib/project-status";
import { PausedProject } from "@/components/paused-project";
import { CopyButton } from "@/components/copy-button";
import { ConnectPanel } from "@/components/project-overview/connect-panel";
import { DatabaseCard } from "@/components/project-overview/database-card";
import { OverviewTiles } from "@/components/project-overview/tiles";
import { UsagePanel } from "@/components/project-overview/usage-panel";

export const dynamic = "force-dynamic";

/**
 * The shell. It resolves the project — which it must do anyway, to know the page exists — and then
 * paints: the title, the layout, and four client panels that fetch their own parts.
 *
 * Measured 2026-09-15, this page used to await eight Management API calls together and render
 * nothing until the slowest landed: 1201–2198 ms, plus 254 ms to resolve the project. The title and
 * the URL sat behind that wait along with everything else.
 *
 * The paused and restoring branch stays here, ahead of anything else: a paused project fails every
 * one of those calls, and the card polls while it restores.
 */
export default async function ProjectOverviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;

  const found = await resolveProject(ref);
  if (!found) notFound();
  const { project } = found;

  if (isPaused(project.status) || isMoving(project.status)) {
    return (
      <div className="mx-auto max-w-7xl p-8">
        <PausedProject project={project} />
      </div>
    );
  }

  const projectUrl = `https://${ref}.supabase.co`;

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

          <OverviewTiles projectRef={ref} status={project.status} />
        </div>

        {/* Dotted canvas with the database card floating inside it, as the dashboard does.
            Two fields, not the project: `resolveProject` returns the upstream body verbatim, and
            handing it to a client component puts every field of GET /v1/projects/{ref} into the RSC
            payload — the same thing `lib/project-parts.ts` refuses to do on the way out. */}
        <DatabaseCard projectRef={ref} region={project.region} />
      </div>

      <ConnectPanel projectRef={ref} dbHost={project.database?.host ?? null} />
      <UsagePanel projectRef={ref} />
    </div>
  );
}
