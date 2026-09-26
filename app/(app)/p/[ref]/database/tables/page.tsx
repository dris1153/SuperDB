import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { TablesPage } from "@/components/project-database/tables-page";

export const metadata: Metadata = { title: "Tables" };

export const dynamic = "force-dynamic";

export default async function DatabaseTablesPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <h1 className="text-2xl text-foreground">Database Tables</h1>
      <TablesPage projectRef={ref} projectName={found.project.name} />
    </div>
  );
}
