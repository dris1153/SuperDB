import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { SqlWorkspace } from "@/components/sql-editor/workspace";

// resolveProject is cache()d, so this shares the layout's fan-out rather than repeating it.
export default async function SqlPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return <SqlWorkspace projectRef={ref} projectName={found.project.name} />;
}
