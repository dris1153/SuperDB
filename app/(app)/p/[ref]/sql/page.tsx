import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { SqlWorkspace } from "@/components/sql-editor/workspace";

export const metadata: Metadata = { title: "SQL Editor" };

export const dynamic = "force-dynamic";

/**
 * The shell. It resolves the project for the 404 and for the name the write confirm puts in front of
 * the user before anything runs; the saved-query list is fetched by the sidebar.
 */
export default async function SqlPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return <SqlWorkspace projectRef={ref} projectName={found.project.name} />;
}
