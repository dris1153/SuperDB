import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { OAuthApps } from "@/components/auth/oauth-apps";

export const dynamic = "force-dynamic";

/**
 * The component owns its header and its column, because the header carries a Docs link and the
 * original has no subtitle — `PageHeader` has neither shape.
 */
export default async function OAuthAppsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return <OAuthApps projectRef={ref} />;
}
