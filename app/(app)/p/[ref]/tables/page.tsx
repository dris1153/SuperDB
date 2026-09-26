import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { TableEditor } from "@/components/table-editor/editor";

export const metadata: Metadata = { title: "Table Editor" };

// Load-bearing even though this page fetches nothing: the editor reads `useSearchParams` without a
// Suspense boundary of its own, and Next fails the production build for that on a prerendered route.
export const dynamic = "force-dynamic";

/**
 * The shell. It resolves the project for the 404 and the project name — which the write confirms
 * need, because they name the database before they touch it — and the editor does the rest.
 *
 * Before this, the page walked the catalog on every interaction: schemas, then the tables in one,
 * then that table's columns, then its rows and its count. Sorting a column re-rendered all of it on
 * the server. The chain still exists, but it runs inside the `rows` reader, one request deep.
 */
export default async function TablesPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return <TableEditor projectRef={ref} projectName={found.project.name} />;
}
