import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { DatabaseTables } from "@/components/project-database/tables-card";

export const metadata: Metadata = { title: "Tables" };

export const dynamic = "force-dynamic";

// ponytail: the old Database page's table list, standing in until Tables is rebuilt against the original.
export default async function DatabaseTablesPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <PageHeader title="Tables">Every table in the project, with its size and row level security.</PageHeader>
      <DatabaseTables projectRef={ref} />
    </div>
  );
}
