import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { GeneralSettings } from "@/components/project-settings/general";
import { SettingsHeader } from "@/components/project-settings/settings-header";

export const dynamic = "force-dynamic";

/**
 * A shell, like every project page since the CSR work: it resolves the project for the 404 and
 * nothing else. The card fetches the same `identity` part the rest of the app reads.
 */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <>
      <SettingsHeader title="General">
        This project&apos;s name, reference and where it runs
      </SettingsHeader>

      <GeneralSettings projectRef={ref} />
    </>
  );
}
