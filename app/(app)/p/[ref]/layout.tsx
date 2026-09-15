import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { ProjectNav } from "@/components/project-nav";
import { QueryProvider } from "@/components/query-provider";

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
    // Scoped to the project routes, which are the only ones that fetch through it. In the shared
    // (app) layout it measured +24,401 bytes on /connections, /settings and the project board too,
    // none of which use it.
    <QueryProvider>
      <div className="flex min-h-screen">
        <ProjectNav projectRef={ref} name={found.project.name} />
        {/* The usage carousel measures this to work out how far it may bleed sideways. */}
        <div data-content-area className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </QueryProvider>
  );
}
