import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { OAuthApps } from "@/components/auth/oauth-apps";

export const dynamic = "force-dynamic";

export default async function OAuthAppsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <>
      <PageHeader title="OAuth Apps">
        Applications that can sign users in with this project
      </PageHeader>
      <OAuthApps projectRef={ref} />
    </>
  );
}
