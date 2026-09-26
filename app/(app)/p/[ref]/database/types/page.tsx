import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { EnumTypesPage } from "@/components/project-database/enum-types-page";

export const metadata: Metadata = { title: "Enumerated Types" };

export const dynamic = "force-dynamic";

export default async function EnumeratedTypesPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <PageHeader title="Database Enumerated Types">Custom data types that you can use in your database tables or functions</PageHeader>
      <EnumTypesPage projectRef={ref} projectName={found.project.name} />
    </div>
  );
}
