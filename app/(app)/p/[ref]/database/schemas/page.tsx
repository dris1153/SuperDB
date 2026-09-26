import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { SchemaVisualizer } from "@/components/project-database/schema-visualizer";

export const metadata: Metadata = { title: "Schema Visualizer" };

export const dynamic = "force-dynamic";

export default async function SchemaVisualizerPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return <SchemaVisualizer projectRef={ref} />;
}
