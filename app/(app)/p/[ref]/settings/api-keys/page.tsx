import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { ApiKeys } from "@/components/project-settings/api-keys";

export const dynamic = "force-dynamic";

/**
 * A shell. The keys are fetched by the card through the part endpoint, which reads them with a TTL of
 * zero — they are credentials, and sixty seconds of one sitting in a server-side cache buys nothing
 * on a page somebody opens to read one thing.
 */
export default async function ApiKeysPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return <ApiKeys projectRef={ref} />;
}
