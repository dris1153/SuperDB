import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { savedQueries } from "@/lib/saved-queries";
import { safe } from "@/lib/safe";
import { SqlWorkspace } from "@/components/sql-editor/workspace";

// resolveProject is cache()d, so this shares the layout's fan-out rather than repeating it.
export default async function SqlPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  // safe(): an unreadable list must not stop the editor loading, which is what this route is for.
  // Null rather than [] so the sidebar can say it could not read them — "nothing saved yet" would
  // be a false claim, and it is exactly what an unapplied schema would show.
  const queries = await safe(() => savedQueries(ref));

  return <SqlWorkspace projectRef={ref} projectName={found.project.name} initialQueries={queries} />;
}
