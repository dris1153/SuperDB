import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { ProjectNav } from "@/components/project-nav";

// resolveProject is cache()d, so this call and the one inside the page share a single fan-out.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return (
    <div className="flex min-h-screen">
      <ProjectNav projectRef={ref} name={found.project.name} />
      {/* The usage carousel measures this to work out how far it may bleed sideways. */}
      <div data-content-area className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
