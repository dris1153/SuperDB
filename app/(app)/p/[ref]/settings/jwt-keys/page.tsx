import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { JwtKeys } from "@/components/project-settings/jwt-keys";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "JWT Keys" };

export const dynamic = "force-dynamic";

export default async function JwtKeysPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  // The name the revoke confirm asks the user to type, taken from the resolve that proved they own
  // the project rather than from anything the browser could supply.
  return (
    <>
      <PageHeader title="JWT Keys">
        Control the keys used to sign JSON Web Tokens for your project
      </PageHeader>

      <JwtKeys projectRef={ref} projectName={found.project.name} />
    </>
  );
}
