import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import { loadInventory } from "@/lib/inventory";
import { ProjectsBoard } from "@/components/projects-board";
import { Card, Empty, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { projects, accounts, errors } = await loadInventory();
  const active = projects.filter((p) => p.status === "ACTIVE_HEALTHY").length;
  const idle = projects.filter((p) => p.status === "INACTIVE").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header>
        <h1 className="text-xl">Projects</h1>
        <p className="text-sm text-fg-subtle">Every Supabase project across every connected account.</p>
      </header>

      {accounts.length === 0 ? (
        <Empty>
          No account connected yet.{" "}
          <Link href="/accounts" className="text-brand-text hover:underline">Add a personal access token</Link> to
          pull in your projects.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Accounts" value={accounts.length} />
            <Stat label="Projects" value={projects.length} />
            <Stat label="Active" value={active} />
            <Stat label="Paused" value={idle} />
          </div>

          {errors.length > 0 ? (
            <Card className="border-warn/40 p-4">
              <div className="flex items-center gap-2 text-sm text-warn">
                <IconAlertTriangle size={16} stroke={1.5} />
                Some accounts could not be read
              </div>
              <ul className="mt-2 space-y-1 text-xs text-fg-subtle">
                {errors.map((e) => (
                  <li key={e.email}>
                    <span className="text-fg-muted">{e.email}</span> — {e.message}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <ProjectsBoard projects={projects} />
        </>
      )}
    </div>
  );
}
