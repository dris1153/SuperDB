import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { ApiKeys } from "@/components/project-settings/api-keys";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

/**
 * A shell. The keys are fetched by the card through the part endpoint, which reads them with a TTL of
 * zero — they are credentials, and sixty seconds of one sitting in a server-side cache buys nothing
 * on a page somebody opens to read one thing.
 */
export default async function ApiKeysPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  // The name is what the disable confirm asks the user to type, so it comes from the same resolve
  // that proved they own the project rather than from anything the browser could supply.
  return (
    <>
      <PageHeader title="API Keys">
        Keys that authenticate requests to this project
      </PageHeader>

      <ApiKeys projectRef={ref} projectName={found.project.name} />
    </>
  );
}
