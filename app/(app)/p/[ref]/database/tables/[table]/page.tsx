import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { TableColumns } from "@/components/project-database/table-columns";

export const dynamic = "force-dynamic";

// Next percent-decodes the segment already; decoding again would change a name containing `%`.
export async function generateMetadata({ params }: { params: Promise<{ table: string }> }): Promise<Metadata> {
  return { title: (await params).table };
}

export default async function TableColumnsPage({ params }: { params: Promise<{ ref: string; table: string }> }) {
  const { ref, table } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-7xl p-8">
      <TableColumns projectRef={ref} projectName={found.project.name} table={table} />
    </div>
  );
}
