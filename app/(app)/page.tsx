import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { IconAlertTriangle } from "@tabler/icons-react";
import { loadInventory } from "@/lib/inventory";
import { reorderProjects, resetProjectOrder } from "@/lib/project-order";
import { ProjectsBoard } from "@/components/projects-board";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";

export const metadata: Metadata = { title: "Projects" };

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { projects, connections, errors, ordered } = await loadInventory();

  async function reorder(refs: string[]) {
    "use server";
    await reorderProjects(refs);
    // Only this page renders the project order.
    revalidatePath("/");
  }

  async function reset() {
    "use server";
    await resetProjectOrder();
    revalidatePath("/");
  }

  const active = projects.filter((p) => p.status === "ACTIVE_HEALTHY").length;
  const idle = projects.filter((p) => p.status === "INACTIVE").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header>
        <h1 className="text-xl">Projects</h1>
        <p className="text-sm text-subtle">Every Supabase project across every connected account.</p>
      </header>

      {connections.length === 0 ? (
        <Empty>
          Nothing connected yet.{" "}
          <Link href="/connections" className="text-brand-text hover:underline">Connect a Supabase organization</Link> to
          pull in your projects.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Connections" value={connections.length} />
            <Stat label="Projects" value={projects.length} />
            <Stat label="Active" value={active} />
            <Stat label="Paused" value={idle} />
          </div>

          {errors.length > 0 ? (
            <Card className="border-warn/40 p-4">
              <div className="flex items-center gap-2 text-sm text-warn">
                <IconAlertTriangle size={16} stroke={1.5} />
                Some connections could not be read
              </div>
              <ul className="mt-2 space-y-1 text-xs text-subtle">
                {errors.map((e) => (
                  <li key={e.owner}>
                    <span className="text-muted-foreground">{e.owner}</span> — {e.message}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <ProjectsBoard projects={projects} ordered={ordered} reorder={reorder} reset={reset} />
        </>
      )}
    </div>
  );
}
