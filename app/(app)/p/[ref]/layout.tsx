import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { NAV_MODE_COOKIE, parseNavMode } from "@/lib/nav-mode";
import { ProjectNav } from "@/components/project-nav";
import { ProjectTopbar } from "@/components/project-topbar";
import { QueryProvider } from "@/components/query-provider";

/**
 * The project in every tab's title, so several open projects can be told apart. `absolute` for this
 * segment's own title — the root's template would otherwise wrap it a second time.
 */
export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params;
  const name = (await resolveProject(ref))?.project.name ?? ref;
  return { title: { absolute: `${name} | SuperDB`, template: `%s | ${name} | SuperDB` } };
}

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

  // Read here so the first paint is already in the right mode. Left to the browser, `expanded` would
  // arrive as a 240px column appearing after hydration and shoving the content sideways on every load.
  const mode = parseNavMode((await cookies()).get(NAV_MODE_COOKIE)?.value);

  return (
    // Scoped to the project routes, which are the only ones that fetch through it. In the shared
    // (app) layout it measured +24,401 bytes on /connections, /settings and the project board too,
    // none of which use it.
    <QueryProvider>
      {/*
        The layout owns the height, and the pages beneath it fill what they are given.
        `h-dvh` rather than `h-screen`: on mobile browsers 100vh includes the retracting address
        bar, so a full-height editor is taller than the visible area for as long as that bar shows.
        `min-h-0` on the content area is not optional — a flex child defaults to `min-height: auto`
        and refuses to shrink, which pushes the page taller instead of scrolling inside it.
      */}
      <div className="flex h-dvh flex-col">
        <ProjectTopbar projectRef={ref} projectName={found.project.name} account={found.connection.display_name} />

        <div className="flex min-h-0 flex-1">
          <ProjectNav projectRef={ref} mode={mode} />
          {/* The usage carousel measures this to work out how far it may bleed sideways. */}
          <div data-content-area className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </QueryProvider>
  );
}
